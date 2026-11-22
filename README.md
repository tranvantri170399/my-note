# My Note Vault

Web siêu tối giản để lưu trữ thông tin **Email & Tài khoản cá nhân** (Thêm, Sửa, Xóa, Tìm kiếm, Sao lưu JSON) sử dụng **Private GitHub Gist** làm Database duy nhất (`data.json`). Không cần backend, không cần server database.

## Cơ chế hoạt động & Bảo mật

- **Mã hóa đầu cuối (End-to-End Encryption)** ngay trên trình duyệt bằng Web Crypto API (`PBKDF2-SHA256` 310,000 vòng lặp + `AES-256-GCM`).
- **Lưu trữ tập trung trong 1 file `data.json`**: toàn bộ nội dung lưu trên Private GitHub Gist đều ở dạng đã mã hóa.
- **Không lưu Token trong code**: GitHub Personal Access Token (PAT) chỉ nhập lúc sử dụng và lưu tạm ở `localStorage` của trình duyệt trên thiết bị cá nhân nếu bạn chọn ghi nhớ.
- **Master Password** chỉ tồn tại trong RAM trong lúc mở khóa, không lưu xuống `localStorage` và không gửi qua mạng.

## Cách sử dụng

1. Tạo một GitHub Personal Access Token (PAT):
   - **Tokens (classic)**: chỉ cần tích duy nhất quyền `gist`.
   - Hoặc **Fine-grained tokens**: chọn quyền `Gists: Read and write`.
2. Mở file `index.html` trực tiếp trên trình duyệt (hoặc chạy server tĩnh / deploy miễn phí lên GitHub Pages).
   ```bash
   python3 -m http.server 8080
   ```
3. Nhập **GitHub PAT** và **Master Password** (có thể để trống ô Gist ID trong lần đầu để web tự tạo một Private Gist mới chứa `data.json`).

## Tính năng chính

- Thêm / Sửa / Xóa / Ghim tài khoản (Email, Mạng xã hội, Công việc, Tài chính, Dev/Cloud, Khác).
- Đặt lịch hẹn nhắc nhở (VD: ngày cần hủy gói dùng thử) kèm cảnh báo trên web và nút đẩy 1-click sang **Google Calendar** (chỉ gửi tiêu đề & nội dung nhắc, không lộ mật khẩu).
- Tạo mật khẩu mạnh ngẫu nhiên (`crypto.getRandomValues`).
- Tìm kiếm không dấu tiếng Việt, sao chép nhanh Email & Mật khẩu.
- Cảnh báo nếu phát hiện Gist vừa được chỉnh sửa từ thiết bị khác trước khi ghi đè.
- Tải về sao lưu `data.json` (bản mã hóa hoặc giải mã), khôi phục từ file `.json`, đổi Master Password, giao diện Sáng/Tối.
