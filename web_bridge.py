"""
web_bridge.py - Cầu nối Python chạy trong Pyodide (WebAssembly) trên trình duyệt.
Nhận chuỗi TeX hoặc dữ liệu file DOCX, thực hiện chuyển đổi hoàn toàn trong bộ nhớ
và trả về dữ liệu file .docx (MathType OLE) dạng nhị phân.
"""

import os
import io
import sys
import re
import tempfile
import traceback

# Thêm thư mục hiện tại vào sys.path để import được core
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from core.tex_normalizer import (
    strip_preamble,
    replace_math_systems,
    replace_ex_and_lists,
    replace_choice_commands,
    clean_true_commands,
    replace_double_slash,
    build_blank_skeleton_docx,
    format_solutions,
    remove_solutions,
    replace_shortans_commands,
    WORD_STANDARDS
)
from core.mathtype_core import docx_processor


def convert_tex_to_docx_bytes(latex_text: str,
                              standard: str = 'btn_group',
                              export_mode: str = 'full',
                              base_pt: float = 11.0,
                              images_dir: str = '/home/pyodide/images',
                              progress_cb=None,
                              header_config: dict = None) -> list:
    """
    Chuyển đổi chuỗi LaTeX sang 1 hoặc 2 file DOCX MathType OLE.
    
    Args:
        latex_text: Nội dung mã nguồn LaTeX
        standard: Tên chuẩn Word ('btn_group', 'dang1', 'dang3', 'dang4', 'dang5')
        export_mode: 'both' (2 file), 'questions' (chỉ đề bài), 'full' (đề & lời giải)
        progress_cb: Callback hàm nhận (phần_trăm: int, thông_báo: str)
        
    Returns:
        Danh sách dict: [{'filename': str, 'data': bytes, 'info': dict}]
    """
    def report(pct: int, msg: str):
        if progress_cb:
            try:
                progress_cb(pct, msg)
            except Exception:
                pass

    report(5, "Đang tiền xử lý cấu trúc LaTeX...")
    
    # Chuẩn hóa ban đầu
    pt_base = strip_preamble(latex_text)
    pt_base = replace_math_systems(pt_base)
    
    tasks = []
    if export_mode == 'both':
        tasks = [
            ('questions', 'De_Thi_MathType.docx'),
            ('full', 'De_Thi_Va_Loi_Giai_MathType.docx')
        ]
    elif export_mode == 'questions':
        tasks = [('questions', 'De_Thi_MathType.docx')]
    else:
        tasks = [('full', 'De_Thi_Va_Loi_Giai_MathType.docx')]
        
    output_files = []
    total_tasks = len(tasks)
    
    for idx, (mode, filename) in enumerate(tasks, 1):
        task_label = "Đề bài" if mode == 'questions' else "Đề bài & Lời giải"
        base_pct = 10 + int((idx - 1) / total_tasks * 80)
        report(base_pct, f"[{task_label}] Đang chuẩn hóa câu hỏi và phương án...")
        
        pt = pt_base
        underline_correct = False
        if header_config and isinstance(header_config, dict):
            underline_correct = bool(header_config.get('underline_correct', False))

        if mode == 'questions':
            pt = remove_solutions(pt)
            pt = replace_shortans_commands(pt, 'questions')
        else:
            pt = format_solutions(pt)
            pt = replace_shortans_commands(pt, 'full')
            
        pt = replace_ex_and_lists(pt)
        choice_mode = 'full' if (underline_correct or mode != 'questions') else 'questions'
        pt = replace_choice_commands(pt, choice_mode, word_standard=standard)
        pt = clean_true_commands(pt, choice_mode)

        # Tháo bỏ vỏ \begin{table} và chuyển \caption thành in đậm nếu có
        pt = re.sub(r'\\caption\s*\{([^}]*)\}', r'\n\n\\textbf{\1}\n\n', pt)
        pt = re.sub(r'\\begin\s*\{table\}(?:\[[^\]]*\])?', '\n\n', pt)
        pt = re.sub(r'\\end\s*\{table\}', '\n\n', pt)
        pt = re.sub(r'\\begin\s*\{center\}\s*(\\begin\s*\{(?:tabular\*?|longtable)\}.*?\\end\s*\{(?:tabular\*?|longtable)\})\s*\\end\s*\{center\}', r'\1', pt, flags=re.DOTALL | re.IGNORECASE)

        # Trích xuất các bảng tabular & longtable trước khi gọi replace_double_slash
        tabular_blocks = []
        def _extract_tabular(m):
            t_idx = len(tabular_blocks)
            tabular_blocks.append(m.group(0))
            return f"\n\n[[TABULAR_{t_idx}]]\n\n"

        tabular_pattern = re.compile(r'\\begin\s*\{(?:tabular\*?|longtable)\}.*?\\end\s*\{(?:tabular\*?|longtable)\}', re.DOTALL | re.IGNORECASE)
        pt = tabular_pattern.sub(_extract_tabular, pt)

        pt = replace_double_slash(pt)
        
        report(base_pct + 10, f"[{task_label}] Đang tạo khung tài liệu Word...")
        tmp_dir = tempfile.mkdtemp(prefix="tex2mt_web_")
        sk_path = os.path.join(tmp_dir, f"skeleton_{mode}.docx")
        out_path = os.path.join(tmp_dir, f"out_{mode}.docx")
        
        doc = build_blank_skeleton_docx(
            pt,
            word_standard=standard,
            temp_img_dir=images_dir,
            tabular_blocks=tabular_blocks,
            header_config=header_config
        )
        doc.save(sk_path)
        
        report(base_pct + 20, f"[{task_label}] Đang chuyển đổi công thức sang MathType OLE...")
        
        def sub_cb(cur, tot, eq):
            sub_pct = base_pct + 20 + int((cur / max(1, tot)) * 18)
            report(sub_pct, f"[{task_label}] Chuyển công thức {cur}/{tot}...")

        conv_info = docx_processor.convert_docx_latex_to_mathtype(
            input_path=sk_path,
            output_path=out_path,
            progress_callback=sub_cb,
            base_pt=base_pt
        )
        
        with open(out_path, "rb") as f:
            docx_data = f.read()
            
        output_files.append({
            'filename': filename,
            'data': docx_data,
            'info': conv_info
        })
        
    report(100, "Hoàn tất chuyển đổi thành công!")
    return output_files


def convert_docx_bytes_inplace(docx_bytes: bytes,
                              base_pt: float = 11.0,
                              progress_cb=None) -> dict:
    """
    Chuyển đổi trực tiếp các công thức LaTeX trong file DOCX sang MathType OLE.
    """
    def report(pct: int, msg: str):
        if progress_cb:
            try:
                progress_cb(pct, msg)
            except Exception:
                pass

    report(10, "Đang nhận file Word DOCX...")
    tmp_dir = tempfile.mkdtemp(prefix="docx_mt_web_")
    in_path = os.path.join(tmp_dir, "input.docx")
    out_path = os.path.join(tmp_dir, "output_mathtype.docx")
    
    with open(in_path, "wb") as f:
        f.write(docx_bytes)
        
    report(25, "Đang quét và chuyển đổi công thức sang MathType OLE...")
    
    def sub_cb(cur, tot, eq):
        sub_pct = 25 + int((cur / max(1, tot)) * 70)
        report(sub_pct, f"Chuyển đổi công thức {cur}/{tot}...")

    conv_info = docx_processor.convert_docx_latex_to_mathtype(
        input_path=in_path,
        output_path=out_path,
        progress_callback=sub_cb,
        base_pt=base_pt
    )
    
    with open(out_path, "rb") as f:
        out_data = f.read()
        
    report(100, "Hoàn tất chuyển đổi file Word!")
    return {
        'filename': 'Converted_MathType.docx',
        'data': out_data,
        'info': conv_info
    }
