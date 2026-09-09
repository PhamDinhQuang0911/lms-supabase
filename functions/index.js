const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer"); // Thêm thư viện gửi mail

admin.initializeApp();

// ==========================================
// CẤU HÌNH GMAIL GỬI TỰ ĐỘNG
// ==========================================
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "phamngockhanh.942001@gmail.com", // Email gửi đi của hệ thống
        pass: "fpty frso luis rzqp" // VÍ DỤ: "abcd efgh ijkl mnop"
    }
});

// ==========================================
// HÀM 1: ĐỔI MẬT KHẨU CHO HỌC SINH (GIỮ NGUYÊN)
// ==========================================
exports.resetStudentPassword = functions.https.onCall(async (data, context) => {
    const { studentUid, newPassword } = data;

    try {
        await admin.auth().updateUser(studentUid, {
            password: newPassword
        });
        return { success: true, message: `Đã đổi mật khẩu thành công!` };
    } catch (error) {
        console.error("Lỗi đổi pass:", error);
        throw new functions.https.HttpsError('internal', 'Lỗi: ' + error.message);
    }
});

// ==========================================
// HÀM 2: TỰ ĐỘNG GỬI EMAIL TÀI LIỆU KÈM CẢNH BÁO
// ==========================================
exports.onOrderCompleted = functions.firestore
    .document("orders/{orderId}")
    .onUpdate(async (change, context) => {
        const nextData = change.after.data();
        const prevData = change.before.data();

        // Kiểm tra: Đơn chuyển sang trạng thái đã thanh toán (paid/completed) + Là đơn Tài liệu + Chưa gửi mail
        if ((nextData.status === "paid" || nextData.status === "completed") && 
            (prevData.status !== "paid" && prevData.status !== "completed") && 
            nextData.orderType === "document" && 
            nextData.deliveryType === "soft_copy" &&
            !nextData.isEmailSent) {
            
            const { documentId, shippingInfo, courseTitle } = nextData;
            const buyerEmail = shippingInfo.email;
            
            if (!buyerEmail) {
                console.log(`Đơn ${context.params.orderId} không có Email nhận, bỏ qua gửi mail.`);
                return null;
            }

            try {
                // Lấy link Drive gốc từ public_courses
                const docSnap = await admin.firestore().collection("public_courses").doc(documentId).get();
                if (!docSnap.exists) {
                    console.error("Không tìm thấy thông tin sản phẩm trên DB!");
                    return null;
                }
                
                const fileUrl = docSnap.data().fileUrl || "#"; 

                // THIẾT KẾ GIAO DIỆN EMAIL HTML CÓ KÈM LỜI DỌA BẢN QUYỀN
                const mailOptions = {
                    from: `"Toán thầy Choang Choang" <phamngockhanh.942001@gmail.com>`,
                    to: buyerEmail,
                    subject: `[Quan trọng] Liên kết tải tài liệu: ${courseTitle}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                            
                            <div style="background-color: #0F766E; color: white; padding: 25px 20px; text-align: center;">
                                <h2 style="margin: 0; font-size: 24px;">Xác nhận đơn hàng thành công!</h2>
                                <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Hệ thống Toán Thầy Choang Choang</p>
                            </div>

                            <div style="padding: 30px 20px;">
                                <p style="font-size: 16px;">Chào bạn,</p>
                                <p style="font-size: 16px;">Cảm ơn bạn đã tin tưởng và đăng ký tài liệu <strong>"${courseTitle}"</strong>.</p>
                                <p style="font-size: 16px;">Dưới đây là liên kết truy cập tài liệu trên nền tảng của chúng tôi:</p>
                                
                                <div style="text-align: center; margin: 35px 0;">
                                    <a href="${fileUrl}" target="_blank" style="background-color: #EA580C; color: white; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; display: inline-block;">🔗 Truy cập Tài Liệu Ngay</a>
                                </div>

                                <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-left: 5px solid #DC2626; padding: 20px; margin-top: 30px; border-radius: 6px;">
                                    <h4 style="color: #DC2626; margin-top: 0; margin-bottom: 12px; font-size: 16px; display: flex; align-items: center;">
                                        ⚠️ LƯU Ý BẢO MẬT & BẢN QUYỀN
                                    </h4>
                                    <p style="font-size: 14px; margin: 0; color: #7F1D1D; text-align: justify;">
                                        Tài liệu này là sản phẩm trí tuệ độc quyền. Hệ thống đã tiến hành <strong>gắn mã định danh điện tử ẩn</strong> theo Email của bạn (<strong>${buyerEmail}</strong>) vào sâu bên trong cấu trúc các tệp tin tải về.<br><br>
                                        Mọi hành vi sao chép, chia sẻ công khai lên mạng xã hội hoặc buôn bán lại dưới bất kỳ hình thức nào đều sẽ bị hệ thống quét tự động truy vết ra người phát tán. Vui lòng chỉ sử dụng cho mục đích học tập cá nhân để tôn trọng chất xám của tác giả.
                                    </p>
                                </div>
                            </div>

                            <div style="background-color: #F9FAFB; padding: 20px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #e5e7eb;">
                                Nếu bạn cần hỗ trợ, vui lòng liên hệ Fanpage Toán QMath.<br>
                                &copy; 2026 Toán Thầy Choang Choang. All rights reserved.
                            </div>
                        </div>
                    `
                };

                // Gửi mail
                await transporter.sendMail(mailOptions);
                console.log(`Đã gửi email tài liệu thành công cho: ${buyerEmail}`);

                // Cập nhật cờ để không gửi trùng vào lần sau
                await admin.firestore().collection("orders").doc(context.params.orderId).update({
                    isEmailSent: true
                });

            } catch (error) {
                console.error("Lỗi quy trình gửi email tài liệu:", error);
            }
        }
        return null;
    });
