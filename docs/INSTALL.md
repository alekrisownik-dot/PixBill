# Instalacja PixBill na Ubuntu Server

Zakładamy laptopa z Ubuntu Server i kartą NVIDIA. Wszystkie polecenia wpisujesz na serwerze.

## 1. Sterownik karty graficznej

```bash
sudo ubuntu-drivers install
sudo reboot
nvidia-smi        # powinno pokazać kartę i ilość pamięci (VRAM)
```

Jeśli karta nie jest NVIDIA albo `nvidia-smi` nie działa, usuń z `docker-compose.yml`
blok `deploy:` w usłudze `ollama`. Ollama będzie wtedy liczyć na procesorze (wolniej, ale zadziała).

## 2. Docker i dostęp kontenerów do GPU

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # potem wyloguj się i zaloguj ponownie

# NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

## 3. Uruchomienie aplikacji

```bash
git clone <adres-repozytorium> pixbill && cd pixbill
cp .env.example .env
nano .env                          # ustaw hasło i PIXBILL_SECRET_KEY (openssl rand -hex 32)
docker compose up -d --build
./scripts/pull-model.sh            # pobiera model do odczytu paragonów (ok. 3 GB, raz)
curl http://127.0.0.1:8000/api/health
```

## 4. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale serve --bg 8000
tailscale serve status             # pokaże adres https://<nazwa-laptopa>.<tailnet>.ts.net
```

Aplikacja nasłuchuje tylko na `127.0.0.1`, więc z sieci domowej ani z internetu nie da się do niej wejść.
Dostęp jest wyłącznie przez Tailscale, z certyfikatem HTTPS (potrzebny do aparatu i instalacji na telefonie).
Jeśli `tailscale serve` prosi o włączenie HTTPS, zrób to w panelu Tailscale: DNS → HTTPS Certificates.

## 5. Kopia zapasowa

```bash
./scripts/backup.sh                # tworzy backups/pixbill-RRRR-MM-DD.tar.gz
```

Warto dodać to do crona, np. codziennie o 3:00:

```
0 3 * * * cd /home/<ty>/pixbill && ./scripts/backup.sh
```

## Aktualizacja

```bash
git pull && docker compose up -d --build
```
