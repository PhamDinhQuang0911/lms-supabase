/**
 * AI Grader Module
 * Xử lý logic gọi API Gemini để chấm bài tự luận.
 */

window.AIGrader = {
    /**
     * Hàm chấm bài bằng AI
     * @param {Object} params - Tham số truyền vào
     * @param {string} params.apiKey - Khóa API của Google Gemini
     * @param {Array} params.studentImages - Mảng các đối tượng chứa base64 của ảnh bài làm học sinh { mimeType, data }
     * @param {string} params.examFileUrl - Link file đề bài (tùy chọn)
     * @param {string} params.solutionUrl - Link file lời giải chuẩn (tùy chọn)
     * @param {string} params.examTitle - Tên bài tập
     * @param {string} params.examDescription - Mô tả bài tập
     * @param {number} params.totalStudentPages - Tổng số trang học sinh cần làm
     * @param {string} params.mode - Chế độ chấm
     * @param {string} params.existingFeedback - Feedback cũ (dùng cho drawOnly)
     * @returns {Object} { score, feedback, mistakes }
     */
    async gradeEssay({ apiKey, apiKeys, studentImages, examFileUrl, solutionUrl, examTitle, examDescription, totalStudentPages, mode, existingFeedback, isSingleQuestion = false }) {
        let keysToUse = apiKeys || [];
        if (keysToUse.length === 0 && apiKey) keysToUse = [apiKey];
        
        if (keysToUse.length === 0) {
            throw new Error("Vui lòng cung cấp API Key để sử dụng chức năng này.");
        }

        if (!studentImages || studentImages.length === 0) {
            return {
                score: 0,
                feedback: "Học sinh không gửi ảnh bài làm cho phần tự luận này.",
                mistakes: []
            };
        }

        // 1. Tạo cấu trúc Prompt (Kịch bản) chi tiết
        let promptText = "";

        if (mode === 'drawOnly') {
            promptText = `Dưới đây là một bài làm tự luận của học sinh (gồm các ảnh) và phần nhận xét đã được giáo viên viết sẵn. Ảnh đầu tiên có index là 0, ảnh thứ hai là 1, v.v.
Nhận xét của giáo viên:\n"${existingFeedback}"

Nhiệm vụ của bạn là: Dựa vào nhận xét trên, hãy định vị (tìm tọa độ) các lỗi sai trên CÁC BỨC ẢNH bài làm.
Trả về tọa độ bounding box [ymin, xmin, ymax, xmax] với giá trị được chuẩn hóa từ 0 đến 1000.

QUAN TRỌNG: BẮT BUỘC trả về chuỗi JSON nguyên gốc tuân thủ cấu trúc sau:
{
  "mistakes": [
    {
      "pageIndex": 0,
      "ymin": 300,
      "xmin": 200,
      "ymax": 350,
      "xmax": 450,
      "note": "Sai dấu",
      "correction": "-5x"
    }
  ]
}
Lưu ý:
- "pageIndex": Số thứ tự ảnh.
- "xmin", "xmax": Phải CỰC KỲ CHẶT CHẼ, CHỈ bao quanh đúng chỗ sai, KHÔNG gạch cả câu dài.
- "note": Vắn tắt nhất có thể (VD: "Sai dấu").
- "correction": CHỈ GHI KẾT QUẢ ĐÚNG (VD: "+x"), TUYỆT ĐỐI KHÔNG ghi chữ "Sửa thành".`;
        } else if (isSingleQuestion) {
            let examContext = "";
            if (examTitle) examContext += `\n- Tên / Yêu cầu câu hỏi: "${examTitle}"`;
            if (examDescription) examContext += `\n- Nội dung chi tiết & Đáp án đối chiếu: "${examDescription}"`;

            promptText = `Bạn là hệ thống AI hỗ trợ chấm bài tập Toán chuyên nghiệp, ngắn gọn và chính xác.

== THÔNG TIN CÂU HỎI ==${examContext}

== YÊU CẦU QUAN TRỌNG VỀ NHẬN XẾT ==
1. KHÔNG GẠCH ĐẦU DÒNG. Viết đoạn văn tự nhiên, ngắn gọn (tối đa 3-4 dòng).
2. TUYỆT ĐỐI KHÔNG CHÀO HỎI, KHÔNG CHÚC MỪNG VÀ KHÔNG ĐỘNG VIÊN (TUYỆT ĐỐI KHÔNG viết "Thầy Quang chào con", "Chúc con học tốt", "Cố lên con nhé", v.v.).
3. Tập trung trực tiếp nêu: Bài làm đã làm được những gì, mắc lỗi sai gì (nếu có) và hướng dẫn vắn tắt cách sửa sai.
`;
            if (mode === 'gradeAndDraw') {
                promptText += `4. TÌM LỖI SAI VÀ TRẢ VỀ BOUNDING BOX: Trả về tọa độ chính xác của từng lỗi sai trên ảnh theo [ymin, xmin, ymax, xmax] chuẩn hóa 0-1000.

BẮT BUỘC trả về chuỗi JSON nguyên gốc tuân thủ CẤU TRÚC SAU:
{
  "score": 8.5,
  "feedback": "Học sinh giải đúng phương trình thứ nhất. Tuy nhiên ở phương trình thứ hai khi chuyển -2y sang vế phải bị sai dấu thành +2y. Cần đổi dấu đúng khi chuyển vế -2y thành +2y.",
  "mistakes": [
    { "pageIndex": 0, "ymin": 300, "xmin": 200, "ymax": 350, "xmax": 450, "note": "Sai dấu", "correction": "+2y" }
  ]
}`;
            } else {
                promptText += `BẮT BUỘC trả về chuỗi JSON nguyên gốc tuân thủ CẤU TRÚC SAU (không có mistakes):
{
  "score": 8.5,
  "feedback": "Học sinh giải đúng phương trình thứ nhất. Tuy nhiên ở phương trình thứ hai khi chuyển -2y sang vế phải bị sai dấu thành +2y. Cần đổi dấu đúng khi chuyển vế -2y thành +2y."
}`;
            }
        } else {
            // Xây dựng phần mô tả đề bài cho AI
            let examContext = "";
            if (examTitle) examContext += `\n- Tên bài tập: "${examTitle}"`;
            if (examDescription) examContext += `\n- Mô tả / Yêu cầu của bài tập: "${examDescription}"`;
            if (examFileUrl) examContext += `\n- Link Đề bài tham khảo: ${examFileUrl}`;
            if (solutionUrl) examContext += `\n- Link Lời giải chuẩn/Đáp án tham khảo: ${solutionUrl}`;
            const pageCount = totalStudentPages || studentImages.length;

            promptText = `Bạn là thầy Quang - một giáo viên Toán chuyên môn cao, thân thiện và tận tâm.

== THÔNG TIN BÀI TẬP ==
${examContext || "(Không có thông tin đề bài điền kèm)"}  
- Học sinh đã nộp: ${pageCount} trang ảnh bài làm. Ảnh đầu tiên có index là 0, ảnh thứ hai là 1, v.v.

== QUAN TRỌNG - HƯỚNG DẪN KIỂM TRA BÀI LÀM ==
Trước khi chấm điểm, hãy QUAN SÁT KỸ CÁC ẢNH và thực hiện kiểm tra sau:
1. ĐỐI CHIẾU ĐỀ BÀI: Nếu có đề bài kèm theo, hãy đọc kỹ đề bài để xác định: Có bao nhiêu DẠNG bài? Mỗi dạng có bao nhiêu CÂU? Tổng cộng học sinh phải làm bao nhiêu câu?
2. SO SÁNH: Nhìn vào các ảnh bài làm, học sinh đã làm được bao nhiêu câu? Bỏ qua câu nào?
3. KẾT LUẬN RÕ RÀNG: Nếu học sinh bỏ trống hoặc chưa làm hết, PHẢI nêu cụ thể: "Con chưa làm [Dạng X - Câu Y, Câu Z]". KHÔNG được chỉ nói chung chung là "còn thiếu một số bài".

Nhiệm vụ của bạn là:\n`;

            if (mode === 'gradeAndDraw') {
                promptText += `1. TÌM LỖI SAI: Tìm TẤT CẢ các lỗi sai (kiến thức, tính toán, trình bày) trên CÁC BỨC ẢNH bài làm.
2. ĐỊNH VỊ LỖI SAI (BOUNDING BOX): Trả về tọa độ chính xác của từng lỗi sai theo định dạng [ymin, xmin, ymax, xmax] chuẩn hóa 0-1000. Lưu ý xmin và xmax CHỈ ĐƯỢC BAO QUANH ĐÚNG CHỖ SAI, KHÔNG gạch toàn bộ câu.
3. CHẤM ĐIỂM: Cho điểm tổng hợp theo thang điểm 10. Nếu bỏ thiếu bài thì trừ điểm tương ứng.
4. NHẬN XÉT: Viết lời phê thân thiện, xưng "thầy" và gọi học sinh là "em" hoặc "con". Lời phê cần:
   - Khen điểm tốt (nếu có)
   - Nếu học sinh CHƯA LÀM ĐỦ BÀI: nêu rõ dạng bài và câu nào chưa làm
   - Liệt kê các lỗi sai cụ thể
   - Động viên học sinh
   - QUAN TRỌNG: Xuống dòng (\\n\\n) khi chuyển ý

QUAN TRỌNG: BẮT BUỘC trả về chuỗi JSON nguyên gốc, tuân thủ CẤU TRÚC SAU:
{
  "score": 8.5,
  "feedback": "Thầy Quang chào con, thầy đã xem bài làm của con.\\n\\nNhìn chung con nắm khá chắc kiến thức cơ bản. Tuy nhiên, con vẫn chưa làm Dạng 2 - Câu 3 và Câu 4.\\n\\nCon còn lỗi sai ở:\\n\\n- Bài 1d sai dấu.\\n\\nCố lên con nhé!",
  "mistakes": [
    {
      "pageIndex": 0,
      "ymin": 300,
      "xmin": 200,
      "ymax": 350,
      "xmax": 450,
      "note": "Sai dấu",
      "correction": "-5x"
    }
  ]
}
Lưu ý: "note" phải cực kỳ vắn tắt (VD: "Sai dấu"). "correction" CHỈ GHI KẾT QUẢ ĐÚNG (VD: "+x"), TUYỆT ĐỐI KHÔNG ghi chữ "Sửa thành". KHÔNG viết dài dòng!`;
            } else { // gradeOnly
                promptText += `1. CHẤM ĐIỂM: Cho điểm tổng hợp theo thang điểm 10 (lấy 1 chữ số thập phân, ví dụ: 8.5). Nếu học sinh bỏ thiếu bài thì trừ điểm tương ứng.
2. NHẬN XÉT: Viết lời phê thân thiện, xưng "thầy" và gọi học sinh là "em" hoặc "con". Lời phê cần:
   - Khen điểm tốt (nếu có)
   - Nếu học sinh CHƯA LÀM ĐỦ BÀI: liệt kê CỤ THỂ dạng bài và câu nào chưa làm (ví dụ: "Con chưa làm Dạng 2 - Câu 2 và Câu 3")
   - Giải thích rõ các lỗi sai cụ thể
   - Động viên học sinh
   - QUAN TRỌNG: Xuống dòng (\\n\\n) khi liệt kê lỗi sai hoặc chuyển ý

QUAN TRỌNG: BẮT BUỘC trả về chuỗi JSON nguyên gốc, tuân thủ CẤU TRÚC SAU (KHÔNG có trường mistakes):
{
  "score": 8.5,
  "feedback": "Thầy Quang chào con, thầy đã xem bài làm của con.\\n\\nBài làm của con nhìn chung sạch sẽ, trình bày rõ ràng.\\n\\nTuy nhiên con chưa làm Dạng 2 - Câu 2 và Câu 3, nhớ làm bổ sung nhé con.\\n\\nCon còn có một số lỗi sai:\\n\\n- Bài 1d sai dấu.\\n\\nCố lên con nhé!"
}`;
            }
        }

        const contentsParts = [{ text: promptText }];
        
        // Đẩy toàn bộ ảnh vào parts
        for (let img of studentImages) {
            contentsParts.push({
                inlineData: {
                    mimeType: img.mimeType || "image/jpeg",
                    data: img.data
                }
            });
        }

        // 2. Hàm gọi API có Retry
        // 2. Hàm gọi API có Retry & Xoay vòng Key
        const fetchWithRetry = async (payload, modelName, maxRetries = 3) => {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    // Chọn ngẫu nhiên 1 key trong mảng
                    const randomKey = keysToUse[Math.floor(Math.random() * keysToUse.length)].trim();
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${randomKey}`;
                    
                    const response = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                    const resData = await response.json();
                    
                    if (resData.error && (resData.error.code === 503 || resData.error.code === 429)) {
                        console.warn(`Lỗi ${resData.error.code} (Lần ${i + 1}/${maxRetries}): Đang thử lại sau 2 giây với Key khác...`);
                        if (i < maxRetries - 1) {
                            if(window.showToast) window.showToast(`Hệ thống AI đang bận. Đang đổi Key và thử lại lần ${i + 1}...`, "info");
                            await new Promise(res => setTimeout(res, Math.min(8000, 1000 * (2 ** i)) + Math.random() * 500));
                            continue;
                        }
                    }
                    return resData;
                } catch (e) {
                    if (i === maxRetries - 1) throw e;
                    await new Promise(res => setTimeout(res, Math.min(8000, 1000 * (2 ** i)) + Math.random() * 500));
                }
            }
        };

        const payload = {
            contents: [{ parts: contentsParts }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        try {
            let resData = await fetchWithRetry(payload, "gemini-3.6-flash", 3);
            if (resData && resData.error) {
                console.warn('Gemini 3.6 Flash không khả dụng, chuyển sang Gemini 3.5 Flash.');
                resData = await fetchWithRetry(payload, "gemini-3.5-flash", 3);
            }
            if (resData.error) {
                throw new Error(`(${resData.error.code}): ${resData.error.message}`);
            }

            // 3. Phân tích kết quả JSON
            const aiText = resData.candidates[0].content.parts[0].text;
            let aiResult = {};
            try {
                let cleanJson = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
                // Regex để trích xuất nguyên khối JSON, loại bỏ các chữ rác ở đầu và cuối
                const match = cleanJson.match(/\{[\s\S]*\}/);
                if (match) {
                    cleanJson = match[0];
                }

                aiResult = JSON.parse(cleanJson);
            } catch(e) {
                console.warn("Lỗi parse JSON (do AI xuất ký tự lạ). Đang tự động trích xuất thủ công...", e);
                let fallbackScore = null;
                let fallbackFeedback = aiText;
                let fallbackMistakes = [];
                
                // Trích xuất điểm
                const scoreMatch = aiText.match(/"score"\s*:\s*([\d\.]+)/);
                if (scoreMatch) fallbackScore = parseFloat(scoreMatch[1]);
                
                // Trích xuất nhận xét
                const feedbackMatch = aiText.match(/"feedback"\s*:\s*"([\s\S]*?)"(?=\s*(?:,|}|$))/);
                if (feedbackMatch) {
                    fallbackFeedback = feedbackMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }
                
                // Trích xuất mistakes
                const mistakesMatch = aiText.match(/"mistakes"\s*:\s*(\[[\s\S]*?\])/);
                if (mistakesMatch) {
                    try {
                        let mStr = mistakesMatch[1].replace(/\n/g, "\\n").replace(/\r/g, "");
                        fallbackMistakes = JSON.parse(mStr);
                    } catch(err) {
                        console.warn("Không thể parse mistakes thủ công", err);
                    }
                }
                
                aiResult = { score: fallbackScore, feedback: fallbackFeedback, mistakes: fallbackMistakes };
            }

            return {
                score: aiResult.score,
                feedback: aiResult.feedback,
                mistakes: aiResult.mistakes || []
            };

        } catch (error) {
            console.error("AI Grading Error:", error);
            throw error;
        }
    }
};
