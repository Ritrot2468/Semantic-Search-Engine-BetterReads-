FROM python:3.11-slim

# 1. System dependencies (Must include build-essential and numpy headers)
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    libopenblas-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Pre-install numpy (LightFM requires it to be present BEFORE it starts its own install)
RUN pip install --no-cache-dir numpy

# 3. Install LightFM with the specific fix
# We set an environment variable and tell pip not to isolate the build
RUN LIGHTFM_NO_PKG_CONFIG=1 pip install lightfm --no-use-pep517 || \
    LIGHTFM_NO_PKG_CONFIG=1 pip install lightfm --no-build-isolation

# 4. Install the rest of your requirements
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001"]