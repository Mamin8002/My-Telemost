# 🚀 Быстрый старт для Windows

## ⚡ Самый простой способ (PowerShell)

### Шаг 1: Откройте PowerShell

1. Нажмите `Win + X`
2. Выберите **"Windows PowerShell"** или **"Terminal"**

### Шаг 2: Перейдите в папку проекта

```powershell
cd C:\Users\Mamin\PycharmProjects\workspace
```

### Шаг 3: Установите OpenSSL (если не установлен)

**Проверьте установку:**
```powershell
openssl version
```

**Если не установлен, выберите один из вариантов:**

**Вариант A: Через Chocolatey (рекомендуется)**
```powershell
# Если Chocolatey не установлен, установите его:
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Установите OpenSSL:
choco install openssl -y
```

**Вариант B: Через winget**
```powershell
winget install openssl
```

**Вариант C: Вручную**
1. Скачайте с https://slproweb.com/products/Win32OpenSSL.html
2. Установите "Win64 OpenSSL v3.x"
3. Добавьте в PATH: `C:\Program Files\OpenSSL-Win64\bin`

### Шаг 4: Сгенерируйте SSL сертификат

```powershell
.\generate-cert.ps1
```

Скрипт создаст:
- `ssl\server.key` - приватный ключ
- `ssl\server.crt` - сертификат

### Шаг 5: Запустите сервер

```powershell
.\start.ps1
```

Сервер запустится и покажет адрес:
```
Protocol:         HTTPS
Network access:   https://192.168.1.100:3000
```

### Шаг 6: Откройте сайт

1. Откройте браузер
2. Перейдите по адресу: `https://192.168.1.100:3000`
   (замените `192.168.1.100` на ваш IP)
3. Браузер покажет предупреждение о безопасности
4. Нажмите **"Advanced"** → **"Proceed to 192.168.1.100 (unsafe)"**

### Шаг 7: Установите сертификат (опционально)

Чтобы убрать предупреждение браузера:

1. Скопируйте файл `ssl\server.crt` на устройство
2. Дважды кликните по файлу
3. Нажмите **"Установить сертификат"**
4. Выберите **"Локальный компьютер"**
5. Выберите **"Поместить все сертификаты в следующее хранилище"**
6. Выберите **"Доверенные корневые центры сертификации"**
7. Завершите установку

Повторите на всех устройствах, которые будут использовать MeetFlow.

---

## 🔄 Альтернатива: Command Prompt

Если PowerShell не работает, используйте Command Prompt:

```cmd
REM 1. Сгенерируйте сертификат
generate-cert.bat

REM 2. Запустите сервер
start.bat
```

---

## 🐛 Решение проблем

### Проблема: "openssl не найден"

**Решение:**
1. Установите OpenSSL (см. Шаг 3)
2. Перезапустите PowerShell
3. Проверьте: `openssl version`

### Проблема: "Cannot be loaded because running scripts is disabled"

**Решение:**
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Проблема: Ошибка при генерации сертификата

**Решение:**
1. Удалите папку `ssl`
2. Запустите скрипт заново
3. Проверьте, что IP адрес правильный

### Проблема: Камера/микрофон не работают

**Решение:**
1. Убедитесь, что используете HTTPS (не HTTP)
2. Проверьте разрешения браузера (нажмите на замок 🔒 в адресной строке)
3. Перезапустите браузер
4. Нажмите кнопку "Диагностика" на сайте

---

## 📋 Команды для копирования

```powershell
# Перейти в папку
cd C:\Users\Mamin\PycharmProjects\workspace

# Установить OpenSSL через Chocolatey
choco install openssl -y

# Сгенерировать сертификат
.\generate-cert.ps1

# Запустить сервер
.\start.ps1

# Открыть сайт
# https://192.168.1.100:3000
```

---

## ✅ Чек-лист

- [ ] PowerShell открыт
- [ ] Находитесь в папке проекта
- [ ] OpenSSL установлен (`openssl version`)
- [ ] Сертификат сгенерирован (`.\generate-cert.ps1`)
- [ ] Сервер запущен (`.\start.ps1`)
- [ ] Сайт открывается через HTTPS
- [ ] Камера и микрофон работают

---

**Готово!** 🎉 Теперь MeetFlow работает с HTTPS на Windows.
