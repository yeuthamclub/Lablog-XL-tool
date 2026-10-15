# LabLog Analyzer · Lablog XL tool

Phần mềm phân tích file log **FinishedJobs** của máy xét nghiệm miễn dịch **LIAISON XL**. Phần mềm tổng hợp kết quả, vẽ biểu đồ QC Levey-Jennings, theo dõi tần suất QC và bảo trì (CLEAN), lọc chéo các xét nghiệm của cùng một Sample ID, và nêu các kết quả có cờ cần xử lý.

Mọi xử lý diễn ra ngay trên thiết bị của người dùng. File log không được tải lên máy chủ nào.

## Chạy ngay

| Thiết bị | Cách dùng |
|---|---|
| Trình duyệt bất kỳ (Windows, Mac, Linux, Android) | Mở **https://yeuthamclub.github.io/Lablog-XL-tool/** |
| iPad, iPhone | Mở link trên bằng Safari, chọn **Chia sẻ › Thêm vào Màn hình chính**. Sau lần mở đầu, ứng dụng chạy được cả khi không có mạng. |
| Windows 10/11 | Tải `LabLog-Analyzer-Setup-…-x64.exe` ở mục [Releases](../../releases) và cài đặt |
| macOS (chip Apple) | Tải `LabLog-Analyzer-…-mac-arm64.dmg` ở mục [Releases](../../releases) |
| macOS (chip Intel) | Tải `LabLog-Analyzer-…-mac-x64.dmg` ở mục [Releases](../../releases) |
| Linux | Tải `LabLog-Analyzer-…-linux-x86_64.AppImage` ở mục [Releases](../../releases) |

Bấm **Dùng dữ liệu mẫu** để xem thử. Dữ liệu mẫu là log **giả lập** ([samples/demo-FinishedJobs.txt](samples/demo-FinishedJobs.txt)), không phải dữ liệu bệnh nhân.

### Lần đầu mở bản cài đặt

- **Windows:** nếu hiện "Windows protected your PC", bấm **More info › Run anyway**. Bộ cài chưa được ký số.
- **macOS:** nhấp phải vào ứng dụng › **Mở**. Trên macOS 15 trở lên, nếu không mở được, vào **System Settings › Privacy & Security › Open Anyway**. Ứng dụng chưa được Apple công chứng.

## Lấy dữ liệu từ máy LIAISON XL

**Bản web (từ v1.2): nạp thẳng file .zip, không cần giải nén.**

1. Trên máy LIAISON XL, vào phần **Backup** và xuất file lưu trữ về máy tính, dạng `2210006840_temp_archive_2025_05.zip` (số máy, năm, tháng). Nếu có file `…_temp_archiveLisLas_….zip` (giao tiếp LIS) thì lấy luôn.
2. Bấm **Thêm file…** hoặc kéo thả các file `.zip` vào trang. Tối đa **30 file** mỗi lần (vd 12 tháng × 2 file, hoặc nhiều máy).
3. Công cụ chỉ đọc phần cần dùng trong zip: `Log/FinishedJobs.txt` (kết quả), `Log/LogFile_*.txt` (nạp ống, hút mẫu, huỷ test, bảo trì, nhiệt độ, thuốc thử, LIS không phản hồi), `DilutionLog.txt` (pha loãng), `lis/C2R*.TRC` (bản ghi ASTM gửi/nhận LIS). Dữ liệu kỹ thuật (C1R*.trc, PIP, LLC, COP, FlashCurves…) được bỏ qua.
4. File zip LIS thường có mật khẩu (ZipCrypto): công cụ hỏi mật khẩu khi cần; mật khẩu chỉ giữ trong phiên làm việc, không lưu, không gửi đi đâu.

Cách cũ vẫn dùng được (và là cách duy nhất ở bản cài đặt v1.1): giải nén, mở thư mục **Log**, nạp `FinishedJobs.txt` (có thể nạp thêm `LogFile_*.txt`).

Nếu dữ liệu thuộc nhiều máy (số máy lấy từ tên file hoặc dòng "Analyzer Serial Number" trong LogFile), chọn máy cần xem ở ô **Máy** trên danh sách file.

## Chức năng

- **Nạp nhiều file log:** mỗi lần mở được cộng dồn. Kết quả trùng giữa các file chỉ tính một lần.
- **Tổng quan:** số kết quả theo ngày, theo xét nghiệm và theo giờ.
- **Kết quả:** tra cứu, lọc, sao chép CSV.
- **Lọc theo Sample ID:**
  - Đặt câu hỏi giữa các xét nghiệm, ví dụ "trong các mẫu có FT4 trong khoảng tham chiếu, bao nhiêu % có TSH vượt?".
  - **Biểu đồ chuông** cho cả hai chiều (FT4 trong KTC → TSH, và TSH trong KTC → FT4), có thang log cho TSH.
  - Tỷ lệ các nhóm Thấp / Trong / Cao và các nhóm lâm sàng có mốc tuỳ chỉnh (TSH < 0,1 · 0,1–0,3 · 0,3–3,6 · 3,6–10 · > 10).
  - **Ma trận 9 ô** TSH × FT4, kèm gợi ý kiểu kết quả và danh sách mẫu trong từng ô.
  - **Cặp kết quả trái chiều** cần xem lại (TSH và FT4 cùng tăng hoặc cùng giảm).
- **Khảo sát KTC:** đánh giá mức phù hợp của khoảng tham chiếu từ chính dữ liệu bệnh nhân. Xem mục riêng bên dưới.
- **Bảo trì (CLEAN):** tần suất, giờ chạy, những ngày chạy mẫu mà không có CLEAN.
- **QC & chuẩn:**
  - Biểu đồ Levey-Jennings cho từng xét nghiệm, quy tắc Westgard.
  - Lịch tần suất QC, danh sách mẫu có cờ, độ lặp lại khi chạy chuẩn.
  - **Theo dõi bằng kết quả bệnh nhân (PBRTQC):** trung vị bệnh nhân theo ngày, so sánh 7 ngày trước và sau khi đổi lô hoặc hiệu chuẩn (kiểm định Mann–Whitney).
- **Thuốc thử & hiệu chuẩn:** lô, serial, starter.
- **Vận hành máy** (cần file sao lưu .zip):
  - **Thời gian trả kết quả (TAT)** từ lúc nạp ống tới khi có kết quả, theo xét nghiệm / giờ / thứ / ngày; mục tiêu TAT tuỳ chỉnh (mặc định 60 phút); chia pha chờ hút, ủ & đo, gửi LIS; danh sách test chậm kèm nguyên nhân có thể (chạy lại, huỷ, pha loãng, LIS chậm, máy dừng, nhiệt độ).
  - **Huỷ test & lỗi** theo lý do (cục đông, hết thuốc thử/Starter, lỗi cơ khí…) × xét nghiệm, theo ngày.
  - **Bảo trì & kiểm tra:** lịch bảo trì ngày/tuần/tháng theo nhật ký máy, xu hướng BGW và Light Check trái/phải (cũng hiện trong tab Bảo trì).
  - **Nhiệt độ & trạng thái:** các lần ngoài khoảng nhiệt độ (tách riêng lúc khởi động), giờ chạy / chờ / bảo trì / dừng mỗi ngày.
  - **Thuốc thử & vật tư:** test còn lại trên máy và dự báo ngày hết, số test thực tế mỗi hộp, Starter, cảnh báo vàng/đỏ của vật tư.
  - **Pha loãng:** kết quả ">" chưa chạy lại pha loãng.
  - **LIS:** thời gian LIS trả y lệnh, lần không phản hồi, kết quả chưa gửi, y lệnh chưa có kết quả, bảng mã LIS ↔ máy; đơn vị LIS gửi được dùng làm đơn vị chính thức.
  - **Hành trình mẫu:** mọi bước của một Sample ID (nạp ống → hỏi LIS → y lệnh → hút → pha loãng → kết quả → gửi LIS).
  - Sự kiện máy (bảo trì, nhiệt độ, đổi lô, hiệu chuẩn) được vẽ thành mốc trên biểu đồ TAT và PBRTQC; mỗi lần QC vi phạm có nút **Sự kiện ±24h**.
- **Cảnh báo:** thuốc thử hoặc hiệu chuẩn hết hạn, vượt ngưỡng đo, mẫu chạy lặp, đổi hộp thuốc thử.
- **Xuất báo cáo:**
  - 8 mẫu: QC, bảo trì, phân bố, khảo sát KTC, cảnh báo, **vận hành**, tổng hợp hoạt động, đầy đủ.
  - Chọn kỳ báo cáo theo tháng hoặc từ ngày đến ngày.
  - **PDF khổ A4** có thông tin đơn vị và ô ký duyệt.
  - **Excel** nhiều sheet, kèm toàn bộ dữ liệu gốc; **CSV**.
  - Tuỳ chọn ẩn bớt Sample ID bệnh nhân.

## Khoảng tham chiếu (KTC)

**KTC đang dùng** được suy ra từ cờ AboveNormalRange / BelowNormalRange của máy, vì log không ghi con số KTC. Giới hạn nằm giữa kết quả không cờ lớn nhất và kết quả có cờ nhỏ nhất; công cụ lấy số tròn gọn nhất trong khoảng đó, ví dụ 3,598–3,602 → 3,6. Đơn vị được suy đoán theo độ lớn của giá trị và sửa được. Kết quả có dấu < / > (ngoài ngưỡng đo, máy không gắn cờ KTC) được xếp nhóm theo KTC suy ra này.

**Khảo sát mức phù hợp** dựa trên các hướng dẫn sau:

- CLSI EP28-A3c: phương pháp phi tham số, và thẩm định trực tiếp 20 mẫu (đạt khi ≤ 2/20 mẫu ngoài KTC).
- IFCC C-RIDL: Jones và cs., *Clin Chem Lab Med* 2019;57:20–29. Phương pháp gián tiếp từ dữ liệu thường quy.
- Thuật toán gián tiếp theo hướng TMC (Wosniok & Haeckel, *CCLM* 2019) và refineR (Ammer và cs., *Sci Rep* 2021):
  - biến đổi Box-Cox;
  - khớp phân bố chuẩn cắt cụt bằng hợp lý cực đại;
  - khoảng tin cậy 90% bằng bootstrap.

Kiểm chứng thuật toán trên 6 kịch bản mô phỏng đã biết KTC thật (n = 300 – 5000, 0 – 30% mẫu bệnh lý):
- sai số trung bình 4,7%;
- khoảng tin cậy 90% chứa giá trị thật ở 81% trường hợp.

Log không có tuổi, giới tính, chẩn đoán, và quần thể là bệnh nhân bệnh viện. Vì vậy kết quả là **sàng lọc dấu hiệu KTC chưa phù hợp**; cần thẩm định trực tiếp trước khi thay đổi KTC.

## Cấu trúc mã nguồn

```
src/template.html          Giao diện và logic chính (HTML/CSS/JS)
src/modules/*.js           Mô-đun: đọc zip, KTC suy từ cờ, phân bố, khảo sát KTC, PBRTQC, Excel, báo cáo, nhật ký máy & vận hành
samples/                   Log mẫu giả lập
scripts/build.py           Dựng web/index.html và desktop/app/index.html từ template + mô-đun
scripts/gen_demo.py        Sinh lại log mẫu giả lập
web/                       Bản web / PWA (xuất bản lên GitHub Pages)
desktop/                   Bản cài đặt Electron cho Windows, macOS, Linux
.github/workflows/         Tự động xuất bản web và đóng gói bản cài
```

## Phát triển

```bash
python3 scripts/build.py            # dựng lại giao diện sau khi sửa src/template.html
cd desktop && npm install && npm start   # chạy bản desktop
```

Mỗi lần đẩy code lên nhánh `main`, GitHub Actions tự xuất bản lại bản web.

Để tạo bản cài đặt mới:

1. Tăng `version` trong `desktop/package.json`.
2. Vào tab **Actions › Bản cài đặt (Windows, macOS, Linux) › Run workflow**. Cách khác: gắn tag rồi đẩy lên, ví dụ `git tag v1.0.1 && git push origin v1.0.1`.
3. GitHub Actions sẽ đóng gói bản Windows, macOS và Linux, rồi đưa vào mục Releases. Mỗi lần chạy mất khoảng 10 phút.

## Lưu ý về dữ liệu

- Không đưa log thật của phòng xét nghiệm vào kho mã này. `.gitignore` đã chặn các file `FinishedJobs*.txt`.
- Phần mềm hỗ trợ rà soát. Phần mềm không thay thế quy trình QC và trả kết quả của phòng xét nghiệm.
