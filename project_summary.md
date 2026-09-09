# BẢN TÓM TẮT DỰ ÁN WEB LMS

Đây là tài liệu tóm tắt tổng quan về dự án Web LMS và các tính năng hiện tại, bao gồm cả những cập nhật mới nhất.

## 1. Tổng quan Dự án (Project Overview)
- **Tên dự án:** Web LMS (Hệ thống Quản lý Học tập & Thi trắc nghiệm trực tuyến).
- **Mục tiêu:** Cung cấp nền tảng toàn diện cho giáo viên để tạo đề thi, quản lý ngân hàng câu hỏi (từ LaTeX, Word), và cho phép học sinh luyện tập trực tuyến với sự hỗ trợ của AI.

## 2. Tech Stack (Công nghệ cốt lõi)
- **Frontend:** Thuần HTML, CSS, Vanilla JS.
- **Styling:** Tailwind CSS (nhúng qua CDN), FontAwesome.
- **Backend & Database:** 
  - **Firebase:** Dùng cho Authentication (Đăng nhập) và Firestore (lưu trữ cấu hình, `MapID tree`, thống kê điểm số).
  - **Cloudflare Workers & R2 Storage:** Dùng làm API để lưu trữ file tĩnh (ảnh, tài liệu PDF) và nội dung câu hỏi dưới dạng JSON.
- **Xử lý Toán học & Hình vẽ:** 
  - Render Toán học: **MathJax 3** (`tex-mml-chtml.js`).
  - Render Hình vẽ TikZ: API biên dịch hình vẽ thông qua VPS chuyên dụng.
  - Chuyển đổi MathType: Tích hợp API Python (Flask) chuyển đổi trực tiếp `OLE objects` trong file Word (.docx) sang LaTeX.

## 3. Các Tính năng Chính đã hoàn thiện

### A. Quản lý Đề thi & Ngân hàng câu hỏi
- **Import linh hoạt:** Hỗ trợ tải lên file mã nguồn LaTeX và đặc biệt là file Word (`.docx`) chứa MathType.
- **Bóc tách thông minh:** Tự động phân tách nội dung file thành từng câu hỏi độc lập (Trắc nghiệm, Đúng/Sai, Trả lời ngắn, Tự luận), nhận diện đáp án, lời giải bằng Regex mạnh mẽ.
- **Xử lý hình ảnh & TikZ:** Tự động trích xuất ảnh inline từ file Word tải lên Cloudflare; nhận diện và biên dịch code TikZ LaTeX thành hình ảnh qua VPS.
- **Gắn mã ID tự động:** Tích hợp AI (Gemini) để đọc nội dung câu hỏi và tự động gán mã chuyên đề (MapID) nếu câu hỏi chưa được phân loại.
- **In ấn & Xuất bản:** Chức năng xuất file PDF chuẩn xác.

### B. Phòng Luyện tập của Học sinh (`practice.html`)
- **Đa dạng dạng bài:** Hỗ trợ cấu trúc đề thi 2025 (Trắc nghiệm nhiều lựa chọn, Đúng/Sai, Điền khuyết).
- **Gia sư AI (Gemini):** Học sinh có thể dùng quyền trợ giúp AI. Hệ thống kết nối với Gemini (flash) để đưa ra **gợi ý giải vắn tắt**, không nói thẳng đáp án.
- **Trợ giúp 50/50:** Loại bỏ 2 phương án sai ngẫu nhiên trong câu hỏi trắc nghiệm 4 lựa chọn.
- **Responsive:** Giao diện tối ưu hoàn toàn cho các thiết bị di động.

### C. Quản lý Chuyên đề - Cây kiến thức (`dashboard-mapid.html`)
- **Kiến trúc đa tầng:** Quản lý cấu trúc môn học theo dạng cây phân cấp (Tree): Khối Lớp > Phân môn > Chuyên đề.
- **Giao diện trực quan:** Các Node trên cây được CSS đẹp mắt, phân loại màu sắc rõ ràng, dễ dàng kéo thả, thêm mới hoặc sửa đổi ID.

## 4. Những cập nhật mới nhất (Phiên bản làm việc gần đây)
1. **Hoàn thiện luồng Import Word (.docx):**
   - Tích hợp thành công API chuyển đổi MathType -> LaTeX.
   - Xây dựng lại bộ lọc (Parser) `preprocessWordToLatex` cực kỳ mạnh mẽ, xử lý triệt để các mã rác HTML (`&nbsp;`, `<strong>`, `<p>`) bị lẫn trong quá trình chuyển đổi `.docx` sang HTML, giúp nhận diện chính xác 100% các câu hỏi và các phương án A, B, C, D.
2. **Sửa các lỗi Runtime (Bug Fixes):**
   - Sửa lỗi không tìm thấy biến cục bộ (`currentExamId`) khi bấm nút **Xem / In PDF**.
   - Sửa lỗi tràn biến bộ nhớ (ReferenceError) trong hàm xử lý LaTeX.

## 5. Hướng phát triển tiếp theo
- Hoàn thiện thuật toán đảo đề/trộn đề (Shuffle) khi học sinh làm bài thi chính thức.
- Tinh chỉnh giao diện hiển thị bảng điểm, báo cáo thống kê sau khi chấm bài.
- Mở rộng kho chuyên đề và đưa các câu hỏi từ đề thi phân loại tự động vào các ngăn tương ứng trong `MapID Tree`.
