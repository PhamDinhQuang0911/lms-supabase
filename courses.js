// --- CẤU HÌNH DANH SÁCH KHÓA HỌC (THẦY SỬA Ở ĐÂY) ---
const courseData = [
    {
        title: "LUYỆN THI TSA - ĐH BÁCH KHOA",
        desc: "Khóa học chuyên sâu tư duy Toán học, giải chi tiết đề thi mẫu và phát triển kỹ năng tư duy logic.",
        img: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=800&auto=format&fit=crop",
        tag: "Hot nhất",
        students: "1.2k"
    },
    {
        title: "TOÁN TƯ DUY LỚP 12",
        desc: "Hệ thống lại kiến thức 12 theo hướng tư duy trắc nghiệm, chuẩn bị cho kỳ thi THPTQG.",
        img: "https://images.unsplash.com/photo-1596495578065-6e0763fa1178?q=80&w=800&auto=format&fit=crop",
        tag: "Cơ bản",
        students: "850"
    },
    {
        title: "TOÁN TƯ DUY LỚP 11",
        desc: "Nền tảng vững chắc cho lớp 12. Tiếp cận sớm với các dạng bài thi đánh giá năng lực.",
        img: "https://images.unsplash.com/photo-1509228468518-180dd4864904?q=80&w=800&auto=format&fit=crop",
        tag: "Nền tảng",
        students: "600"
    },
    {
        title: "LỚP 10 - BỨT PHÁ ĐIỂM SỐ",
        desc: "Làm quen với phương pháp học mới cấp 3. Xây dựng tư duy toán học hiện đại.",
        img: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800&auto=format&fit=crop",
        tag: "Mới",
        students: "450"
    },
    {
        title: "KHO TÀI LIỆU LATEX",
        desc: "Bộ tài liệu soạn thảo bằng Latex chuẩn đẹp, hỗ trợ giáo viên và học sinh tra cứu.",
        img: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=800&auto=format&fit=crop",
        tag: "Tài liệu",
        students: "Free"
    },
    {
        title: "GIẢI ĐỀ THI THỬ 2026",
        desc: "Cập nhật các đề thi thử mới nhất từ các trường chuyên trên cả nước.",
        img: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=800&auto=format&fit=crop",
        tag: "Luyện đề",
        students: "900"
    }
];

// --- HÀM RENDER KHÓA HỌC (KHÔNG CẦN SỬA) ---
function renderCourses() {
    const container = document.getElementById('courseListContainer');
    if (!container) return; // Bảo vệ nếu không tìm thấy thẻ chứa

    let html = '';
    courseData.forEach(c => {
        html += `
        <div class="course-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm flex flex-col h-full">
            <div class="relative h-48 overflow-hidden">
                <img src="${c.img}" alt="${c.title}" class="w-full h-full object-cover transform hover:scale-110 transition-transform duration-500">
                <span class="absolute top-3 left-3 bg-accent text-white text-xs font-bold px-3 py-1 rounded-full shadow-md uppercase">${c.tag}</span>
            </div>
            <div class="p-6 flex-1 flex flex-col">
                <h3 class="text-xl font-extrabold text-gray-800 mb-2 line-clamp-2 hover:text-brand transition-colors cursor-pointer">${c.title}</h3>
                <p class="text-gray-500 text-sm mb-4 line-clamp-3 flex-1">${c.desc}</p>
                
                <div class="border-t border-gray-100 pt-4 flex items-center justify-between mt-auto">
                    <div class="flex items-center gap-2 text-sm text-gray-500 font-bold">
                        <i class="fa-solid fa-users text-teal-500"></i> ${c.students}
                    </div>
                    <button onclick="toggleRegisterModal(true)" class="text-brand font-bold text-sm hover:text-accent transition-colors flex items-center gap-1">
                        Chi tiết <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        </div>
        `;
    });
    container.innerHTML = html;
}

// Chạy hàm render khi trang load xong
document.addEventListener('DOMContentLoaded', renderCourses);
