# 🎬 KỊCH BẢN CHẠY THỬ VÀ DEMO SẢN PHẨM (LC-VISION FLOW DEMO)

Tài liệu này hướng dẫn chi tiết kịch bản từng bước nhỏ (all-in-one) để chạy thử nghiệm và trình diễn toàn bộ tính năng của dự án LC-Vision trên giao diện Web.

---

## 🛠️ Chuẩn bị trước khi chạy Demo (Preparation)
1. Đảm bảo toàn bộ hệ thống đang chạy ổn định bằng Docker:
   ```bash
   docker compose up --build -d
   ```
2. Xác minh hai file PDF mẫu kiểm thử đã có sẵn trên máy của bạn:
   * **File hợp lệ (Pass Case):** [invoice_valid.pdf](file:///Users/maitranhuy/Documents/HackathonCodex/backend/test_samples/invoice_valid.pdf)
   * **File lỗi/sai lệch (Fail Case):** [invoice_invalid.pdf](file:///Users/maitranhuy/Documents/HackathonCodex/backend/test_samples/invoice_invalid.pdf)

---

## 🚀 Kịch bản Demo từng bước (Step-by-Step Demo Flow)

### Bước 1: Mở giao diện và Kiểm tra hạ tầng
1. Mở trình duyệt Web và truy cập địa chỉ: [http://localhost:3000](http://localhost:3000).
2. Kiểm tra xem góc trên cùng bên phải giao diện có hiển thị chấm xanh nhấp nháy: `● Doanh Nghiệp (Multi-Agent Vision)` hay chưa (báo hiệu kết nối backend sẵn sàng).

### Bước 2: Trình diễn "AI Giải mã điện SWIFT MT700"
1. Tại ô **1. Cấu hình L/C tham chiếu** ở cột bên trái, click chuyển sang tab **Bức điện SWIFT**.
2. Copy đoạn điện SWIFT mẫu dưới đây và dán vào ô nhập liệu:
   ```text
   :20: LCNUMBER778899
   :59: BENEFICIARY
   ASIA TEXTILE JOINT STOCK COMPANY
   10 CO GIANG STREET, DISTRICT 1, HO CHI MINH CITY, VIETNAM
   :32B: CURRENCY CODE, AMOUNT
   EUR 120000,00
   :44A: PORT OF LOADING
   CAT LAI PORT, VIETNAM
   :44C: LATEST DATE OF SHIPMENT
   260815
   ```
3. Bấm nút **AI Tự Động Phân Tích L/C** và quan sát:
   * Sau 1-2 giây, giao diện sẽ tự chuyển về tab **Nhập Form**.
   * Các trường thông tin L/C đã tự động được điền chuẩn xác (Số tiền: `120,000`, Loại tiền: `EUR`, Người thụ hưởng: `ASIA TEXTILE...`, Hạn giao hàng: `2026-08-15`, Cảng bốc hàng: `CAT LAI PORT...`).

### Bước 3: Trình diễn "Upload chứng từ Hợp lệ & Tối ưu hóa Agent"
Để tiện demo, ta cấu hình lại các thông số L/C về các thông số mặc định của bộ kiểm thử:
* *Max Amount:* `50000` | *Currency:* `USD` | *Latest Shipment:* `2026-06-30` | *Beneficiary:* `GLOBAL TRADING CORP` | *Port:* `HAIPHONG PORT`
1. Kéo và thả tệp [invoice_valid.pdf](file:///Users/maitranhuy/Documents/HackathonCodex/backend/test_samples/invoice_valid.pdf) vào vùng upload ở cột bên trái.
2. Bấm nút **Chạy đối chiếu AI**.
3. Quan sát **Trình giám sát tác nhân AI (Live Console)** ở góc trên bên phải:
   * Tiến trình sẽ cập nhật từng bước thời gian thực.
   * Tại bước 4, AI sẽ thông báo: `[Tối ưu hóa] Độ tự tin bóc tách của Agent 1 cao (>=85%), tự động bỏ qua Agent 2...` (Trình diễn tính năng tối ưu hóa chi phí/độ trễ).
4. Quan sát kết quả đối chiếu:
   * Bảng kết quả hiển thị **màu xanh lá pastel (Pass)** hoàn toàn.
   * Bên dưới hiển thị các đoạn **Trích dẫn gốc (Quote)** tương ứng cho mỗi trường (minh chứng AI minh bạch).
   * Không có bất kỳ dòng cảnh báo lỗi sai biệt nào.

### Bước 4: Trình diễn "Đối chiếu Sai lệch & Cảnh báo độ tin cậy AI"
1. Tại vùng upload, bấm nút **Hủy bỏ & Chọn lại**.
2. Kéo và thả tệp [invoice_invalid.pdf](file:///Users/maitranhuy/Documents/HackathonCodex/backend/test_samples/invoice_invalid.pdf) vào vùng upload.
3. Bấm nút **Chạy đối chiếu AI** và theo dõi Live Console.
4. Quan sát kết quả đối chiếu:
   * Các ô dữ liệu vi phạm điều khoản L/C được tô đậm bằng **màu đỏ pastel (Fail)**.
   * Hiển thị bảng chi tiết 4 lỗi bất hợp lệ (vượt hạn mức, muộn hạn giao hàng, sai tên thụ hưởng, sai cảng bốc hàng).
   * Các ô dữ liệu bóc tách được từ hình ảnh có hiển thị điểm tin cậy (Confidence %).

### Bước 5: Trình diễn can thiệp thủ công (Human-in-the-Loop - HITL)
1. Trên bảng kết quả đối chiếu, tìm dòng **Tổng số tiền** (đang báo lỗi đỏ do thực tế hóa đơn là `73,000` trong khi L/C yêu cầu `<= 50,000`).
2. Rê chuột vào dòng đó và click nút **bút chì (Edit)**.
3. Thay đổi giá trị từ `73000` thành `48000` và bấm nút **Lưu (Checkmark)**.
4. Quan sát:
   * Hệ thống tự động tính toán so khớp lại ngay lập tức tại Client.
   * Dòng **Tổng số tiền** lập tức chuyển từ màu đỏ (Fail) sang **màu xanh (Pass)**.
   * Số lỗi bất hợp lệ giảm đi và điểm tin cậy của trường này nhảy lên **100%** (do con người đã xác thực).

### Bước 6: Trình diễn "Giả lập Ký số & Nhật ký vận hành dài hạn"
1. Cuộn xuống phần soạn thảo Email vướng mắc **Auto-Waiver Letter** ở cuối trang:
   * Quan sát thư nháp song ngữ Anh - Việt chuyên nghiệp do GPT-4o tự soạn thảo liệt kê đầy đủ các lỗi sai lệch còn lại để gửi bên mua ký nhận.
2. Bấm nút **Approve & Sign Report**:
   * Hộp thoại kết nối cổng chữ ký số VNPT SmartCA hiện lên, chạy giả lập truyền dữ liệu băm và ký duyệt trong 2.5 giây.
   * Hệ thống hiển thị ký duyệt thành công kèm mã **TxHash** độc bản.
3. Cuộn xuống phần **Nhật ký vận hành (Audit Trail)**:
   * Quan sát dòng thời gian ghi nhận đầy đủ lịch sử hoạt động từ khi tải file, AI bóc tách, người dùng sửa tay (HITL), cho đến khi hoàn thành ký duyệt SmartCA.

### Bước 7: Xác minh "Tính lâu dài của Audit Trail" (SQLite Persistence)
1. Bấm nút **F5 (Reload/Tải lại trang)** trình duyệt.
2. Cuộn xuống chân trang kiểm tra phần **Nhật ký vận hành (Audit Trail)**:
   * Quan sát: Toàn bộ dòng lịch sử hoạt động cũ **không bị mất** mà được tự động tải trực tiếp từ cơ sở dữ liệu SQLite ở Backend lên hiển thị.

### Bước 8: Dọn dẹp phiên làm việc
1. Cuộn lên vùng upload, bấm nút **Hủy bỏ & Chọn lại**:
   * Hệ thống sẽ dọn dẹp giao diện sạch sẽ và đồng thời gửi lệnh xóa toàn bộ nhật ký trên SQLite database để sẵn sàng cho lượt chạy demo tiếp theo.