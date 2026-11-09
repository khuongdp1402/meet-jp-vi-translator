# 🌐 Meet EN-JA-VI IT Infra Translator & History (v2.0)

Extension chạy trực tiếp trên **Google Meet** chuyên biệt cho kỹ sư **IT Infrastructure / Cloud Migration / System & Network** làm việc với đội ngũ đa quốc gia (**Tiếng Anh - Tiếng Nhật - Tiếng Việt**):

1. **Hỗ trợ Đa Ngôn Ngữ (`EN ⇄ JA ⇄ VI`)**:
   - Tự động nhận diện ngôn ngữ người đang nói (**Tiếng Nhật `JA`**, **Tiếng Anh `EN`**, **Tiếng Việt `VI`**) hoặc chọn cặp ngôn ngữ dịch trực tiếp ngay trên thanh phụ đề nổi.
   - Hỗ trợ tạo câu trả lời nhanh bằng cả **Tiếng Nhật (Keigo / Teineigo + Romaji)** và **Tiếng Anh chuẩn IT Infra**.
2. **Dịch Sát Nghĩa Chuyên Ngành IT Infrastructure**:
   - Tích hợp từ điển chuyên sâu ngành Hạ tầng & Di trú hệ thống: *Linux/RHEL, Windows Server, Active Directory (AD), DNS (`resolv.conf`, `/etc/hosts`), Proxy (`i-FILTER`, `PAC`), Firewall (`firewalld`, `FortiGate`), SELinux, Kdump, Swap, LVM, Network (`nmcli`, Static Route, Prefix, Default Gateway), VMware, Cloud (`KCPS`, `AWS`, `Azure`), Live Migration, Rollback (`切り戻し`), Cutover (`切り替え`), Khảo sát hiện trạng (`現調`), Parameter Sheet (`パラメータシート`), Ảnh chụp bằng chứng (`証跡`), Kiểm tra thông mạng (`疎通確認`), Giám sát (`死活監視`), Jump Host (`踏み台`)...*
   - Tự động sửa lỗi nhận diện âm thanh (ASR homophone errors) của phụ đề Google Meet trước khi dịch và bám sát ngữ cảnh đoạn phụ đề liền kề trên Meet.
3. **Tự Động Ngắt Câu Thông Minh Theo Nghĩa (`🧠 Tự ngắt câu`)**:
   - **Không cần đợi người khác chen vào mới ngắt câu!**
   - Tự động tách câu theo dấu kết câu (nhưng bảo toàn chính xác các dấu chấm trong địa chỉ IP `192.168.1.1`, phiên bản `RHEL 8.6` hay tên file `resolv.conf`), theo cấu trúc mệnh đề ngữ pháp Nhật/Anh/Việt và theo nhịp nghỉ lấy hơi (~1.15s).
4. **Lưu Trữ Danh Sách Lịch Sử & Nội Dung Tổng Hợp Cuộc Họp (`📚 Lịch sử & Tổng hợp`)**:
   - Tự động lưu liên tục mọi cuộc họp vào bộ nhớ trình duyệt theo mã phòng họp (F5 tải lại trang không mất chữ).
   - Xem **Danh sách các cuộc họp đã lưu** (ngay trên Google Meet hoặc bấm vào icon Extension trên thanh công cụ Chrome bất cứ lúc nào).
   - Tự động tóm tắt trực tiếp **"📌 Cuộc họp đang trao đổi những gì?"** (Chủ đề IT Infra, các thông số/lệnh/server vừa bàn, quyết định & Action Items/QA) + Chat hỏi AI + Xuất file `.MD` / `.DOC` (Word).

---

## 🚀 Cách cập nhật / cài đặt vào Chrome / Edge / Brave

1. Mở `chrome://extensions/` trên trình duyệt.
2. Nếu đã cài bản trước, chỉ cần bấm nút **🔄 Reload (Tải lại)** trên thẻ của tiện ích **Meet EN-JA-VI IT Infra Translator & History** (hoặc bấm **Load unpacked** chọn thư mục `/Users/khuongdp/meet-jp-vi-translator`).
3. Tải lại (F5) tab **Google Meet** đang mở để áp dụng giao diện mới.
