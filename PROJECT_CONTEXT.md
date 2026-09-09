# BẢN TÓM TẮT DỰ ÁN WEB LMS (LỊCH SỬ LÀM VIỆC)
*File này dùng để cung cấp ngữ cảnh (Context) cho các AI/phiên trò chuyện khác để có thể hiểu và tiếp tục phát triển dự án.*

---

## 1. Tổng quan Dự án (Project Overview)
- **Tên dự án:** Web LMS (Hệ thống Quản lý Học tập & Thi trắc nghiệm trực tuyến).
- **Mục tiêu:** Cung cấp nền tảng cho giáo viên tải lên câu hỏi (từ file LaTeX), quản lý ngân hàng câu hỏi, tạo đề thi, và cho phép học sinh làm bài thi/luyện tập trực tuyến.
- **Thư mục làm việc hiện tại:** `C:\Users\ADMIN\Downloads\web LMS\V1\PhamDinhQuang0911.github.io-main`

## 2. Tech Stack (Công nghệ cốt lõi)
- **Frontend:** Thuần HTML, CSS, JavaScript (Vanilla JS).
- **Styling:** Tailwind CSS (nhúng qua CDN `cdn.tailwindcss.com`), FontAwesome.
- **Backend & Database:** 
  - **Firebase:** Dùng cho Authentication (Đăng nhập) và Firestore (lưu trữ cấu hình, `MapID tree`, tiến trình học tập).
  - **Cloudflare Workers & R2 Storage:** Dùng làm API để lưu trữ file tĩnh (ảnh, tài liệu PDF) và đặc biệt là lưu trữ trực tiếp nội dung các câu hỏi dưới dạng file `.json` riêng lẻ. URL endpoint: `https://upload-helper.phamngockhanh-942001.workers.dev/` và `/bank`.
- **Xử lý Toán học & Hình vẽ:** 
  - Render Toán học: **MathJax 3** (`tex-mml-chtml.js`).
  - Render Hình vẽ TikZ: Gọi API biên dịch hình vẽ thông qua VPS (`http://42.96.4.216:3000/compile-batch`).

## 3. Cấu trúc Tính năng đã hoàn thiện

### A. Quản lý Ngân hàng câu hỏi & Bóc tách LaTeX (`topic-parser.js`, `exam-editor.html`)
- Xử lý mã nguồn LaTeX cực kỳ phức tạp (môi trường `\begin{ex}... \choice... \loigiai...`).
- Bóc tách đề thi thành từng câu, xác định phương án đúng (qua thẻ `\True`), trích xuất lời giải.
- Đã giải quyết triệt để lỗi biên dịch hình vẽ TikZ (VPS Batch rendering) cho các câu hỏi phức tạp (Ví dụ: Câu 14, 32).
- Các câu hỏi được lưu thành file JSON độc lập trên Cloudflare, có gắn `MapID` (Mã Chuyên đề).

### B. Phòng Luyện tập của Học sinh (`practice.html`)
- **Giao diện làm bài:** Hỗ trợ hiển thị câu hỏi trắc nghiệm, câu hỏi Điền khuyết (Short Answer) và Đúng/Sai (TF). Tự động lưu đáp án và chấm điểm.
- **Tích hợp Gia sư AI (Gemini):** Đã kết nối thành công API của Google Gemini (sử dụng model `gemini-1.5-flash` / `gemini-2.0-flash`). Khi học sinh bấm "Gợi ý AI", AI sẽ đọc câu hỏi và lời giải ẩn, sau đó đưa ra **1-2 câu gợi ý cực kỳ vắn tắt** về hướng giải (tuyệt đối không cho đáp án).
- **Tính năng Trợ giúp 50/50:** Khi học sinh sử dụng, hệ thống tự động tìm và làm mờ (vô hiệu hóa) 2 phương án sai ngẫu nhiên, để lại 1 phương án đúng và 1 phương án sai.
- **Tối ưu Mobile (Responsive):** Giao diện bảng điều khiển cài đặt bài luyện tập (chọn Khối lớp, Phân môn, Chuyên đề) đã được CSS lại gọn gàng, dạng lưới (Grid), không bị tràn hay đè khung trên điện thoại.

### C. Quản lý Chuyên đề - Cây kiến thức (`dashboard-mapid.html`, `mapid-manager.js`)
- **Quản lý ID:** Xây dựng dạng cây (Tree) phân cấp đa tầng.
- **Giao diện đã CSS làm đẹp (Lớp > Phân môn > Chuyên đề):** Cây kiến thức đã được đổ màu, bo góc, phân cấp bằng icon đẹp mắt (Màu vàng cho Lớp, Xanh dương cho Phân môn...). Nút (+) thêm chuyên đề hiển thị rõ ràng `opacity-100`.
- **Cấu trúc Tab (Mới nhất):** Được chia làm 2 Tab rõ rệt:
  1. *Quản lý ID Cây kiến thức:* Giao diện quản lý cấu trúc ID cơ bản (có bảng thống kê bên phải).
  2. *Xây dựng Chuyên đề:* Không gian rộng rãi ở giữa để hiển thị danh sách các câu hỏi bên trong chuyên đề đang chọn.
- *(Ghi chú: Các chức năng thao tác trực tiếp như "Nhập file", "Chọn từ kho" vào chuyên đề hiện đang tạm gác lại theo yêu cầu của người dùng để ưu tiên công việc khác).*

## 4. Các điểm cần chú ý (Lưu ý cho Developer/AI nối tiếp)
1. **Biến toàn cục:** Rất nhiều tính năng sử dụng biến toàn cục (`window.practiceQuestions`, `window.globalBankQuestions`). Chú ý phân quyền scope khi chuyển đổi giữa `<script type="module">` và `<script>` thường.
2. **Thuộc tính câu hỏi (Question JSON):** Một object câu hỏi tiêu chuẩn thường chứa: `content` (nội dung), `options` (các phương án), `correctAnswer` (ký tự A/B/C/D), `correct` (index số nguyên 0/1/2/3 của phương án đúng), `solution` (lời giải), `mapId` (mã chuyên đề). Khi xử lý câu hỏi do `topic-parser.js` bóc ra, đôi khi biến `correct` không có sẵn mà phải tính lại qua `correctAnswer`.
3. **Mô hình Gemini:** Tuyệt đối dùng API `models/gemini-1.5-flash:generateContent` hoặc `gemini-2.0-flash`. Không gọi `gemini-3.5-flash` vì Google không tồn tại phiên bản này (nếu gọi sẽ dính lỗi 404/503).
4. **Vấn đề CORS & DOM ảo:** Khi click vào nút `input type="file"` được tạo bằng JS thuần, phải `appendChild` nó vào DOM trước khi `.click()` để trình duyệt không chặn (Đã xử lý ở `mapid-manager.js`).

---
*(End of context. Khi dán file này vào cuộc trò chuyện mới, hãy yêu cầu AI đọc và phân tích toàn bộ file trước khi bắt đầu nhận lệnh mới).*
