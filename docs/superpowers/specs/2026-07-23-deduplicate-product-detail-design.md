# Thiết kế tinh gọn trang chi tiết sản phẩm

## Mục tiêu

Giảm thông tin lặp trên trang phân tích chi tiết mà không làm mất dữ liệu cần thiết để ra quyết định.

## Phân công thông tin theo từng tầng

- Khu vực đầu trang hiển thị duy nhất trạng thái hiện tại: giá mua, giá bán, premium, spread và điểm tín hiệu. Tín hiệu chỉ xuất hiện một lần cạnh tên sản phẩm.
- Bảng tóm tắt lịch sử giữ vai trò so sánh premium và spread hiện tại với median và percentile của kỳ được chọn.
- Biểu đồ chỉ giữ vai trò thể hiện xu hướng. Tiêu đề biểu đồ không lặp lại giá bán hoặc spread hiện tại đã xuất hiện phía trên.

## Thay đổi

1. Xóa khối “Nhận định nhanh”, bao gồm SignalBadge thứ hai, badge diễn giải và các câu mô tả lặp lại dữ liệu của bảng lịch sử.
2. Thêm “Điểm tín hiệu” vào lưới chỉ số hiện tại để không làm mất score.
3. Đổi lưới chỉ số thành bố cục 2 cột trên mobile, 3 cột từ tablet và 5 cột trên desktop.
4. Bỏ giá bán hiện tại khỏi header biểu đồ giá và bỏ số tiền/các thống kê hiện tại-thường gặp khỏi header biểu đồ spread.
5. Giữ tooltip biểu đồ vì nó cung cấp giá trị theo từng ngày khi tương tác, không phải nội dung lặp tĩnh.

## Kiểm thử

- Kiểm thử source contract xác nhận trang chi tiết không còn “Nhận định nhanh”, chỉ gọi `SignalBadge` một lần và vẫn hiển thị “Điểm tín hiệu”.
- Kiểm thử source contract xác nhận chart header không còn truyền `primary` cho giá bán/spread và không còn stats lặp ở biểu đồ spread.
- Chạy toàn bộ lint, typecheck, test và build trước khi push.

