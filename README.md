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

## Lấy file FinishedJobs.txt từ máy LIAISON XL

1. Trên máy LIAISON XL, vào phần **Backup** và xuất file lưu trữ về máy tính. File có dạng `2210006840_temp_archive_2025_05.zip` (số máy, năm, tháng).
2. Giải nén file `.zip` đó.
3. Mở thư mục **Log** bên trong, tìm file **FinishedJobs.txt**.
4. Nạp vào công cụ: bấm **Thêm file log…** (bản cài đặt: **Tệp › Mở file log…**), hoặc kéo thả file vào cửa sổ.

```
2210006840_temp_archive_2025_05.zip
└── (giải nén)
    └── Log/
        └── FinishedJobs.txt   ← file cần nạp
```

Muốn phân tích nhiều tháng: lấy file lưu trữ của từng tháng và nạp lần lượt. Các file đều tên `FinishedJobs.txt`, nhưng công cụ vẫn giữ riêng từng file, đánh số (2), (3)… và chỉ tính một lần các kết quả trùng.

## Chức năng

- **Nạp nhiều file log:** mỗi lần mở được cộng dồn. Kết quả trùng giữa các file chỉ tính một lần.
- **Tổng quan:** số kết quả theo ngày, theo xét nghiệm và theo giờ.
- **Kết quả:** tra cứu, lọc, sao chép CSV.
- **Lọc theo Sample ID:** ví dụ "trong các mẫu có FT4 trong khoảng tham chiếu, bao nhiêu % có TSH vượt?".
- **Bảo trì (CLEAN):** tần suất, giờ chạy, những ngày chạy mẫu mà không có CLEAN.
- **QC & chuẩn:** biểu đồ Levey-Jennings cho từng xét nghiệm, quy tắc Westgard, lịch tần suất QC, danh sách mẫu có cờ, độ lặp lại khi chạy chuẩn.
- **Thuốc thử & hiệu chuẩn:** lô, serial, starter.
- **Cảnh báo:** thuốc thử hoặc hiệu chuẩn hết hạn, vượt ngưỡng đo, mẫu chạy lặp, đổi hộp thuốc thử.

## Cấu trúc mã nguồn

```
src/template.html          Giao diện và toàn bộ logic phân tích (một file HTML/JS)
samples/                   Log mẫu giả lập
scripts/build.py           Dựng web/index.html và desktop/app/index.html từ template
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
2. Gắn tag và đẩy lên:
   ```bash
   git tag v1.0.1 && git push origin v1.0.1
   ```
3. GitHub Actions sẽ đóng gói bản Windows, macOS và Linux, rồi đưa vào mục Releases.

## Lưu ý về dữ liệu

- Không đưa log thật của phòng xét nghiệm vào kho mã này. `.gitignore` đã chặn các file `FinishedJobs*.txt`.
- Phần mềm hỗ trợ rà soát. Phần mềm không thay thế quy trình QC và trả kết quả của phòng xét nghiệm.
