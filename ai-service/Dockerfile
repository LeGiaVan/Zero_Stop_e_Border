# Sử dụng image Python 3.11 gọn nhẹ
FROM python:3.11-slim

# Đặt thư mục làm việc trong container
WORKDIR /app

# Copy file requirements trước để tận dụng Docker cache
COPY requirements.txt .

# Cài đặt thư viện Python
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ thư mục code (bao gồm file main.py, thư mục app,...) vào container
COPY . .

# Expose cổng 8000 ra ngoài (Cổng mặc định của FastAPI)
EXPOSE 8000

# Chạy ứng dụng FastAPI thông qua Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
