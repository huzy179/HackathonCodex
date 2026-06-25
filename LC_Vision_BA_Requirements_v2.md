# LC-Vision — BA Requirements Document
**Phiên bản:** 2.0 | **Ngày:** 25/06/2026  
**Mục đích:** Tài liệu định nghĩa nghiệp vụ AS-IS & luồng TO-BE cho dev

---

## PHẦN 1 — AS-IS: CHECKLIST NGHIỆP VỤ KIỂM TRA CHỨNG TỪ

> Tài liệu này là **Business Rules** cần đưa vào System Prompt cho AI Model.

---

### LAYER 1 — Kiểm tra nội bộ từng chứng từ (Document-level Validation)

#### 1A. Commercial Invoice (Hóa đơn thương mại)

| # | Trường kiểm tra | Rule | Loại lỗi |
|---|---|---|---|
| 1 | Invoice Number | Phải có, không để trống | Hard |
| 2 | Invoice Date | Phải có, format ngày hợp lệ | Hard |
| 3 | Tên & địa chỉ Beneficiary (người bán) | Phải có, đầy đủ | Hard |
| 4 | Tên & địa chỉ Applicant (người mua) | Phải có, đầy đủ | Hard |
| 5 | Mô tả hàng hóa (Description of Goods) | Phải có, không để trống | Hard |
| 6 | Số lượng (Quantity) | Phải có, là số dương | Hard |
| 7 | Đơn giá (Unit Price) | Phải có, là số dương | Hard |
| 8 | Tổng giá trị (Total Amount) | Phải có, = Quantity × Unit Price | Hard |
| 9 | Loại tiền tệ (Currency) | Phải có (USD / EUR / VND...) | Hard |
| 10 | Điều kiện Incoterms | Phải có (FOB / CIF / CFR...) | Soft |
| 11 | Chữ ký / con dấu Beneficiary | Phải có | Soft |

#### 1B. Bill of Lading — B/L (Vận đơn đường biển)

| # | Trường kiểm tra | Rule | Loại lỗi |
|---|---|---|---|
| 1 | Tên Shipper (người giao hàng) | Phải có | Hard |
| 2 | Tên Consignee (người nhận hàng) | Phải có | Hard |
| 3 | Notify Party | Phải có | Soft |
| 4 | Port of Loading (Cảng bốc) | Phải có | Hard |
| 5 | Port of Discharge (Cảng đến) | Phải có | Hard |
| 6 | On Board Date (Ngày xếp hàng lên tàu) | Phải có, là ngày hợp lệ | Hard |
| 7 | B/L Date (Ngày phát hành B/L) | Phải có | Hard |
| 8 | Vessel Name & Voyage No. | Phải có | Soft |
| 9 | Mô tả hàng hóa | Phải có | Hard |
| 10 | Số lượng / Trọng lượng hàng | Phải có | Hard |
| 11 | Loại B/L | Phải là "Clean on Board" — không có ghi chú bảo lưu | Hard |
| 12 | Chữ ký của Carrier / Agent | Phải có (UCP 600 Art.20) | Hard |
| 13 | Số bộ B/L gốc phát hành | Phải ghi rõ (VD: "3/3 originals") | Soft |

#### 1C. Packing List (Phiếu đóng gói)

| # | Trường kiểm tra | Rule | Loại lỗi |
|---|---|---|---|
| 1 | Tên hàng hóa | Phải có | Hard |
| 2 | Số lượng từng loại hàng | Phải có, là số dương | Hard |
| 3 | Net Weight (Trọng lượng tịnh) | Phải có | Hard |
| 4 | Gross Weight (Trọng lượng cả bao bì) | Phải có | Hard |
| 5 | Số kiện / thùng (Number of Packages) | Phải có | Hard |

---

### LAYER 2 — Kiểm tra chéo giữa các chứng từ (Cross-document Consistency)

#### 2A. Invoice ↔ B/L

| # | Trường so sánh | Rule | Loại lỗi |
|---|---|---|---|
| 1 | Tên Beneficiary ↔ Tên Shipper | Phải khớp (fuzzy match cho phép viết tắt) | Hard |
| 2 | Mô tả hàng hóa | Phải tương đồng về nội dung cốt lõi | Hard |
| 3 | Số lượng hàng | Phải khớp hoặc nằm trong tolerance cho phép | Hard |
| 4 | Port of Loading | Phải khớp chính xác hoặc tương đương | Hard |
| 5 | Port of Discharge | Phải khớp chính xác hoặc tương đương | Hard |
| 6 | Thứ tự thời gian | On Board Date (B/L) phải trước hoặc bằng Invoice Date | Soft |

#### 2B. Invoice ↔ Packing List

| # | Trường so sánh | Rule | Loại lỗi |
|---|---|---|---|
| 1 | Tên hàng hóa | Phải tương đồng | Hard |
| 2 | Số lượng | Phải khớp | Hard |
| 3 | Tổng trọng lượng | Gross Weight phải nhất quán | Soft |

#### 2C. B/L ↔ Packing List

| # | Trường so sánh | Rule | Loại lỗi |
|---|---|---|---|
| 1 | Số kiện / thùng | Phải khớp | Hard |
| 2 | Gross Weight | Phải khớp hoặc sai lệch không đáng kể | Hard |

---

### LAYER 3 — Kiểm tra so với điều khoản LC (LC Compliance)

| # | Trường kiểm tra | Rule nghiệp vụ | Loại lỗi |
|---|---|---|---|
| 1 | Tên Beneficiary | Invoice phải khớp tên trong LC (fuzzy match) | Hard |
| 2 | Tên Applicant | Invoice phải ghi đúng tên như trong LC (UCP 600 Art.18) | Hard |
| 3 | Tổng tiền (Amount) | Invoice Amount ≤ LC Max Amount + tolerance | Hard |
| | | → LC ghi "about/approximately": dung sai ±10% | |
| | | → LC không ghi gì: dung sai ±5% (UCP 600 Art.30) | |
| | | → LC ghi "exactly": 0% dung sai | |
| 4 | Loại tiền (Currency) | Phải khớp tuyệt đối (USD ≠ EUR) | Hard |
| 5 | Ngày xếp hàng (Shipment Date) | On Board Date trên B/L ≤ Latest Shipment Date trong LC | Hard |
| 6 | Ngày hết hạn LC (Expiry Date) | Ngày xuất trình ≤ LC Expiry Date. Nếu trễ: từ chối tuyệt đối, không thể Waiver | Hard (Absolute) |
| 7 | Port of Loading | Phải khớp với LC (fuzzy match tên cảng) | Hard |
| 8 | Port of Discharge | Phải khớp với LC | Hard |
| 9 | Mô tả hàng hóa | Invoice description phải phù hợp với goods description trong LC | Hard |
| 10 | Incoterms | Điều kiện giao hàng phải khớp (FOB, CIF, CFR...) | Hard |
| 11 | Partial Shipment | Nếu LC ghi "Prohibited": không được giao hàng từng phần | Hard |
| 12 | Transhipment | Nếu LC ghi "Prohibited": B/L không được ghi chuyển tải | Hard |

---

### PHÂN LOẠI LỖI (Discrepancy Classification)

| Loại | Màu UI | Ý nghĩa | Xử lý |
|---|---|---|---|
| **Hard Discrepancy** | 🔴 Đỏ | Lỗi nghiêm trọng, ảnh hưởng thanh toán | Bắt buộc sửa hoặc từ chối |
| **Soft Discrepancy** | 🟡 Vàng | Lỗi nhỏ, có thể chấp nhận | Có thể xin Waiver từ Applicant |
| **Warning** | ⚠️ Cam | AI không chắc chắn (Confidence < 80%) | Chuyên viên cần kiểm tra lại thủ công |

---

## PHẦN 2 — TO-BE: USER JOURNEY TRÊN HỆ THỐNG

### 2.1 Actor & Phân quyền

**Chỉ có 1 actor duy nhất trên hệ thống: Chuyên viên ngân hàng**

> **Lý do:** AS-IS cần 2 người (Maker + Checker) vì con người dễ bỏ sót lỗi, cần người thứ hai kiểm tra lại.
> TO-BE dùng Multi-Agent AI (Agent 1 Extractor + Agent 2 Auditor) để thay thế hoàn toàn vai trò Checker.
> Chuyên viên chỉ cần upload, xem kết quả AI, HITL sửa nếu cần, và ra quyết định cuối.

| Role | Nhiệm vụ trên hệ thống |
|---|---|
| **Chuyên viên** | Upload LC + chứng từ → Xem kết quả AI → HITL nếu cần → Ra kết luận |

---

### 2.2 User Journey Chi Tiết — Luồng Chính

---

#### BƯỚC 1 — Login

| | Chi tiết |
|---|---|
| **Actor** | Chuyên viên |
| **Action** | Đăng nhập bằng tài khoản nội bộ |
| **Output** | Redirect về Dashboard |

---

#### BƯỚC 2 — Dashboard

| | Chi tiết |
|---|---|
| **Actor** | Chuyên viên |
| **UI** | Danh sách các bộ chứng từ đã tạo |
| **Thông tin mỗi dòng** | Tên bộ / Ngày tạo / Trạng thái / Kết luận |
| **Trạng thái** | `Draft` → `Processing` → `Pending Decision` → `Compliant` / `Discrepant` / `Closed` |
| **Action** | Nhấn **"+ Tạo kiểm tra mới"** → Bước 3 |

---

#### BƯỚC 3 — Upload LC & Bộ chứng từ

**Mục tiêu:** Chuyên viên upload tất cả file, AI tự extract toàn bộ — không nhập liệu thủ công.

**Bước 3A — Upload file**

| File | Label | Bắt buộc |
|---|---|---|
| File LC | Thư tín dụng (LC) | ✅ |
| Commercial Invoice | Hóa đơn thương mại | ✅ |
| Bill of Lading | Vận đơn đường biển | ✅ |
| Packing List | Phiếu đóng gói | Khuyến nghị |

> Cho phép upload tất cả cùng lúc (drag & drop nhiều file). Hệ thống tự nhận diện loại chứng từ dựa vào nội dung AI đọc được.

**Action:** Nhấn **"Phân tích"** → Hệ thống OCR tất cả file → Bước 3B

---

**Bước 3B — Review LC Terms (Safety Gate)**

> AI đã OCR file LC và tự động extract toàn bộ thông tin điều khoản.
> Hệ thống hiển thị lại để chuyên viên **đọc qua và xác nhận** trước khi dùng làm ground truth.
> **Dev note:** Chỉ cần render read-only các field AI đọc được + nút Xác nhận. Không cần editable form, không cần validation phức tạp.

**Các field hiển thị (read-only, AI pre-filled):**
LC Number / Beneficiary Name / Applicant Name / Max Amount / Currency / Amount Tolerance / Latest Shipment Date / Expiry Date / Port of Loading / Port of Discharge / Incoterms / Partial Shipment / Transhipment / Goods Description

**Lý do bước này tồn tại (để trả lời giám khảo):** Nếu AI OCR nhầm LC mà không có ai xác nhận, toàn bộ kết quả check sẽ sai mà hệ thống không phát hiện được. Safety Gate này đảm bảo ground truth luôn được human verify trước khi chạy.

**Action:** Nhấn **"Xác nhận & Bắt đầu kiểm tra"** → Bước 4

---

#### BƯỚC 4 — AI Processing

| | Chi tiết |
|---|---|
| **Actor** | Hệ thống (không cần user thao tác) |
| **UI** | Loading screen với progress |
| **Luồng backend** | 1. PDF → Ảnh base64 (PyMuPDF) |
| | 2. **Agent 1 (Extractor):** OCR + bóc tách thông tin từng chứng từ + quote gốc + confidence |
| | 3. **Agent 2 (Auditor):** Rà soát lại kết quả Agent 1 trên ảnh gốc, đính chính nếu sai |
| | 4. Layer 1: Validate từng chứng từ riêng lẻ |
| | 5. Layer 2: Cross-check giữa các chứng từ |
| | 6. Layer 3: So sánh với LC Terms đã confirm ở Bước 3B |
| | 7. Sinh danh sách Discrepancy + phân loại Hard/Soft/Warning |
| | 8. Nếu có Soft Discrepancy → auto-draft Waiver Letter |
| **Output** | Kết quả → render Bước 5 |

---

#### BƯỚC 5 — Xem kết quả kiểm tra

**Layout màn hình:**

```
┌──────────────────────────────────────────────────────┐
│  SUMMARY BOX                                         │
│  ✅ 8/12 trường PASS  🔴 2 Hard  🟡 1 Soft  ⚠️ 1 Warn │
│                                                      │
│  Kết luận sơ bộ: 🔴 DISCREPANT                       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  BẢNG KẾT QUẢ CHI TIẾT                               │
│  Trường | Giá trị LC | Giá trị thực tế | Quote | ✏️  │
│  ────────────────────────────────────────────────── │
│  🔴 Amount  | USD 50,000 | USD 55,000 | "Total:55k" │
│  🟡 Benefi. | VIET NAM. | VIETNAM..  | "Seller:.."  │
│  ✅ Currency | USD       | USD        | "Curr: USD"  │
│  ⚠️ Port..  | HCM PORT  | (không rõ) | [scan mờ]   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  WAIVER LETTER DRAFT (hiển thị khi có Soft error)   │
│  [Nội dung thư song ngữ Anh - Việt tự động sinh]    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  AUDIT TRAIL                                         │
│  14:32 Upload bộ chứng từ                            │
│  14:33 Agent 1 hoàn thành extraction                 │
│  14:33 Agent 2 hoàn thành audit                      │
└──────────────────────────────────────────────────────┘
```

**Business Rules:**

| Rule | Chi tiết |
|---|---|
| Confidence < 80% | Hiển thị ⚠️ "Cần kiểm tra lại" nhấp nháy bên cạnh field |
| Hard Discrepancy | Nền đỏ, badge "FAIL" |
| Soft Discrepancy | Nền vàng, badge "WARNING" |
| PASS | Nền xanh lá, badge "PASS" |
| Quote gốc | Hiển thị đoạn text trích xuất từ PDF dưới mỗi giá trị |

---

#### BƯỚC 6 — HITL: Chỉnh sửa thủ công (nếu AI sai)

| | Chi tiết |
|---|---|
| **Actor** | Chuyên viên |
| **Trigger** | Nhấn icon ✏️ bên cạnh bất kỳ field nào |
| **Action** | Field chuyển sang edit mode, nhập giá trị đúng |
| **Khi lưu** | Hệ thống re-check field đó với LC Terms ngay lập tức |
| **Kết quả** | Nếu đúng: 🔴 → ✅, Confidence = 100% (Human verified) |
| **Audit** | Ghi log: "[timestamp] Chuyên viên sửa [field]: [cũ] → [mới]" |

---

#### BƯỚC 7 — Ra kết luận & Hành động tiếp theo

Đây là bước thể hiện **Bước 5 trong AS-IS** (Kết luận trạng thái) lên hệ thống.

**Sau khi chuyên viên đã review xong kết quả AI + HITL nếu cần:**

---

**Kịch bản A — COMPLIANT (Không có lỗi)**

```
┌──────────────────────────────────────────────────────┐
│  ✅ COMPLIANT                                         │
│  Toàn bộ chứng từ hợp lệ theo điều khoản LC         │
│                                                      │
│  [✅ Xác nhận — Chuyển hồ sơ sang bộ phận giải ngân] │
└──────────────────────────────────────────────────────┘
```

| Action | Kết quả |
|---|---|
| Chuyên viên nhấn "Xác nhận" | Trạng thái → `Compliant` |
| | Hệ thống ghi Audit Trail: "Chuyên viên xác nhận COMPLIANT lúc [timestamp]" |
| | (Roadmap) Trigger thông báo sang bộ phận giải ngân |

---

**Kịch bản B — DISCREPANT (Có lỗi)**

```
┌──────────────────────────────────────────────────────┐
│  🔴 DISCREPANT                                        │
│  Phát hiện 2 Hard + 1 Soft Discrepancy               │
│                                                      │
│  [📄 Gửi Waiver Letter cho khách hàng]               │
│  [❌ Từ chối thanh toán — Đóng case]                  │
└──────────────────────────────────────────────────────┘
```

**Option B1 — Gửi Waiver Letter (khách hàng có thể accept lỗi)**

| Action | Kết quả |
|---|---|
| Chuyên viên nhấn "Gửi Waiver Letter" | Hiển thị Waiver Letter draft đã sinh sẵn |
| | Chuyên viên review + chỉnh sửa nếu cần |
| | Chuyên viên gửi cho khách hàng (Applicant) |
| | Trạng thái → `Pending Customer Decision` |
| Khách hàng đồng ý (chuyên viên upload Waiver đã ký) | Trạng thái → `Compliant with Waiver` |
| | Ghi Audit Trail |
| | (Roadmap) Trigger giải ngân |
| Khách hàng từ chối | Trạng thái → `Closed — Rejected` |

**Option B2 — Từ chối thanh toán ngay**

| Action | Kết quả |
|---|---|
| Chuyên viên nhấn "Từ chối thanh toán" | Bắt buộc nhập lý do |
| | Trạng thái → `Closed — Rejected` |
| | Ghi Audit Trail đầy đủ |

---

### 2.3 Sơ đồ luồng tổng thể

```
[Login]
   ↓
[Dashboard] → Xem danh sách / Tạo mới
   ↓
[Upload LC + Bộ chứng từ]
   ↓
[AI OCR tất cả file]
   ↓
[Review & Confirm LC Terms] ← Safety Gate (chuyên viên confirm)
   ↓
[AI Processing]
  Agent 1 Extract → Agent 2 Audit → Layer 1,2,3 Check → Sinh Discrepancy List
   ↓
[Màn hình kết quả]
  Summary Box + Bảng chi tiết + Quote gốc + Confidence Score
   ↓
[HITL - Chỉnh sửa thủ công nếu AI sai] ← Chuyên viên
   ↓
[Ra kết luận]
   ├── ✅ COMPLIANT → Xác nhận → Chuyển giải ngân
   └── 🔴 DISCREPANT
         ├── Gửi Waiver Letter → Chờ khách hàng
         │     ├── Khách hàng accept → Compliant with Waiver
         │     └── Khách hàng reject → Closed Rejected
         └── Từ chối ngay → Closed Rejected
```

---

### 2.4 Trạng thái bộ chứng từ (Status Flow)

```
Draft → Processing → Pending Decision → Compliant
                                      → Compliant with Waiver
                                      → Pending Customer Decision → Compliant with Waiver
                                                                  → Closed Rejected
                                      → Closed Rejected
```

---

### 2.5 Edge Cases

| Trường hợp | Xử lý |
|---|---|
| AI không nhận diện được loại chứng từ | Hỏi user "File này là loại chứng từ gì?" |
| AI đọc LC Terms có field Confidence < 80% | Highlight field đó trong Bước 3B, yêu cầu chuyên viên confirm kỹ |
| Expiry Date đã qua | Block ngay tại Bước 3B, cảnh báo "LC đã hết hạn — không thể tiếp tục" |
| Upload file không phải PDF/ảnh | Báo lỗi định dạng |
| AI Processing thất bại | Hiển thị lỗi + nút Retry |

---

*Tài liệu v2.0 — Cập nhật: bỏ ký số, 1 actor duy nhất, LC upload thay form nhập tay, bổ sung luồng kết luận COMPLIANT/DISCREPANT*
*LC-Vision Hackathon Team — MSB 2026*
