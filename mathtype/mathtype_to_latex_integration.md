# Tóm tắt Dự án: MathType to LaTeX (toanhocdo/latex12)

Tài liệu này cung cấp cái nhìn tổng quan về chức năng, luồng hoạt động và các lưu ý quan trọng của dự án [toanhocdo/latex12](https://github.com/toanhocdo/latex12) nhằm hỗ trợ việc tích hợp vào các dự án Web khác.

## 1. Mục tiêu & Chức năng cốt lõi
Dự án này giải quyết bài toán **chuyển đổi ngược**: Nhận đầu vào là một file Microsoft Word (`.docx`) chứa các công thức toán học được soạn bằng **MathType** (nhúng dưới dạng OLE objects), sau đó tự động trích xuất, giải mã và thay thế các công thức này thành định dạng chữ **LaTeX** (bao bọc bởi `$ ... $`).

**Các tính năng nổi bật:**
- **Can thiệp trực tiếp mã nguồn file Word:** Không yêu cầu cài đặt phần mềm Microsoft Word hay phần mềm MathType trên máy chủ (server).
- **Phân tích định dạng nhị phân:** Trích xuất file `.docx` (vốn là một file ZIP), tìm đến các file `embeddings/oleObject*.bin`, và giải mã cấu trúc dữ liệu nhị phân MTEF (MathType Equation Format) sang chuỗi LaTeX tương ứng.
- **Tự động thay thế & Định dạng:** Xóa bỏ đối tượng OLE trong `document.xml`, thay bằng chuỗi LaTeX. Định dạng chữ LaTeX được tự động chuyển thành màu xanh lá cây (`008000`) và xóa bỏ các canh chỉnh lệch dòng (subscript/superscript) để chuỗi hiển thị ngay ngắn trên baseline.
- **Làm sạch mã LaTeX:** Tự động loại bỏ các khoảng trắng thừa và cấu trúc ma trận/mảng (array) bị lồng nhau không cần thiết.

## 2. Các giao diện hỗ trợ (Interfaces)
Mã nguồn cung cấp sẵn 3 phương thức giao tiếp:
1. **CLI (Command Line):** File `convert_mathtype_to_latex.py` nhận 2 tham số: đường dẫn file `.docx` đầu vào và file `.docx` đầu ra.
2. **GUI (Desktop App):** File `gui-mt.py` sử dụng thư viện Tkinter tạo giao diện kéo thả cho người dùng phổ thông.
3. **Web API (Flask):** Nằm trong thư mục `/api`, cung cấp endpoint RESTful cho phép upload file Word và trả về file đã chuyển đổi.

## 3. Hướng dẫn tích hợp vào dự án Web
Dự án đã được thiết lập sẵn một Web API bằng Flask và tối ưu cho nền tảng Serverless (Vercel). Dưới đây là các chi tiết tích hợp dành cho hệ thống Web của bạn.

### 3.1. Endpoint API
- **URL:** `POST /api/convert`
- **Content-Type:** `multipart/form-data`
- **Body:** Trường `file` chứa file `.docx` cần chuyển đổi.
- **Giới hạn kích thước:** Mặc định là 10MB (có thể cấu hình lại biến `MAX_FILE_SIZE` trong `api/index.py`).
- **Response:** 
  - Thành công (200 OK): Trả về file `.docx` đã được xử lý dưới dạng file đính kèm (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
  - Thất bại (400, 413, 500): Trả về JSON chứa thông báo lỗi, ví dụ: `{"error": "File too large (max 10MB)"}`.

### 3.2. Yêu cầu môi trường (Dependencies)
- **Ngôn ngữ:** Python 3.x
- **Thư viện bên thứ ba (xem `requirements.txt`):**
  - `olefile` (Rất quan trọng: dùng để đọc cấu trúc OLE/MTEF của Microsoft).
  - `Flask`, `Werkzeug` (Dành cho Web API).

### 3.3. Luồng xử lý tệp tạm (Temp Files)
Trong hàm `convert()` của API:
1. File `.docx` upload lên được lưu tạm vào thư mục bộ nhớ tạm (`tempfile.gettempdir()`).
2. Gọi hàm `process_docx(input_path, output_path)`.
3. Gửi file `output_path` về cho client bằng `send_file`.
4. **Xóa dọn tệp tạm:** Đảm bảo xóa cả input và output file trong khối `finally` để tránh rò rỉ dung lượng ổ cứng (đặc biệt quan trọng trên môi trường Serverless).

> [!WARNING]
> Khi tích hợp mã nguồn dịch MTEF vào hệ thống của bạn, hãy đảm bảo giữ nguyên thư mục `mtef_py` vì đây là trái tim của quá trình giải mã nhị phân. Các file trong module này được viết để xử lý các byte cụ thể của định dạng MathType.

## 4. Những hạn chế và Lưu ý
> [!CAUTION]
> - **Chỉ hỗ trợ file `.docx`:** Các file Word định dạng cũ (`.doc`) không phải là file ZIP chứa XML, do đó công cụ này **không thể** xử lý. Cần nhắc người dùng chuyển sang `.docx` trước khi upload.
> - **Chỉ xử lý công thức MathType:** Các công thức toán học được viết bằng trình gõ phương trình mặc định của Word (OMML - Office Math Markup Language) sẽ bị bỏ qua vì chúng không phải là OLE objects MTEF.
> - **Hiệu năng & Đồng thời (Concurrency):** File API dùng PID (`os.getpid()`) để đặt tên file tạm. Nếu chạy trên server đa luồng (multi-thread) mà cùng chung một PID, có thể xảy ra xung đột tên file. Nên sửa lại sử dụng `uuid` để tạo tên file ngẫu nhiên và an toàn tuyệt đối.

## 5. Khuyến nghị tùy chỉnh (Customizations)
Nếu AI khác sẽ tiếp quản bộ mã này, hãy lưu ý nó thực hiện các nâng cấp sau:
1. **Sửa tên file tạm an toàn hơn:** Đổi `f'input_{os.getpid()}.docx'` thành `uuid.uuid4().hex` để tránh xung đột trên multi-threaded workers.
2. **Tuỳ chỉnh màu sắc & thẻ:** Hiện tại script hardcode việc thêm thẻ `<w:color w:val="008000"/>` (Màu xanh) cho text LaTeX (dòng 68 `convert_mathtype_to_latex.py`). Nếu UI của bạn không muốn công thức bị đổi màu, hãy bảo AI khác gỡ bỏ logic này.
3. **Cải tiến `clean_latex_formula`:** Tùy thuộc vào parser hiển thị LaTeX trên Web của bạn (ví dụ: MathJax hay KaTeX), bạn có thể cần thêm các quy tắc Regular Expression khác để chuẩn hóa cú pháp cho phù hợp.
