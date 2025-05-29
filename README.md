:::thinking
Пользователь просит объединить два README файла в один, где запуск осуществляется через docker-compose. У него есть:
1. README для фронтенда (React/Next.js) - погодное приложение
2. README для бэкенда (FastAPI) - API для получения погоды

Нужно создать единый README, который описывает полное приложение (фронтенд + бэкенд), запускаемое через docker-compose.
:::
# Weather Service - Полнофункциональное приложение для прогноза погоды

Веб-приложение для получения прогноза погоды, состоящее из React/Next.js фронтенда и FastAPI бэкенда. Приложение позволяет искать погоду по городам, сохранять историю поиска и отслеживать статистику запросов.

## Функциональность

### Фронтенд (React/Next.js)
- 🔍 Поиск погоды по названию города
- 📊 Отображение текущей погоды и почасового прогноза (до 24 часов)
- 📈 График температуры
- 🕐 История последних 10 поисков
- 🍪 Сохранение последнего города и ID пользователя в cookies
- 🎨 Иконки погодных условий

### Бэкенд (FastAPI)
- 🌡️ Получение данных о погоде через Open-Meteo API
- 📍 Геокодирование городов через Nominatim API
- 💾 Сохранение истории запросов в SQLite
- 📊 Подсчет статистики обращений к городам
- ⚡ Асинхронная обработка запросов
- 🔄 Кэширование и retry-логика

## Архитектура

```
weather-service/
├── docker-compose.yml
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   │   └── WeatherApp.jsx
│   ├── package.json
│   └── ...
└── backend/
    ├── Dockerfile
    ├── main.py
    ├── api/
    │   ├── services/
    │   │   └── weather.py
    │   └── base/
    │       └── database_func.py
    └── requirements.txt
```

## API Endpoints

### Backend API

1. **GET /**
   - Возвращает приветственное сообщение
   ```json
   {
     "message": "Weather API: используйте POST /weather/{user_id} с {'city': 'Город'}"
   }
   ```

2. **POST /weather/{user_id}**
   - Получение погоды для города
   - Тело запроса:
   ```json
   {
     "city": "Москва"
   }
   ```
   - Ответ:
   ```json
   {
     "city": "Москва",
     "current": {
       "temperature": 21.5,
       "humidity": 50,
       "wind_speed": 3.2,
       "weather_code": 1
     },
     "hourly": {
       "temperature_2m": [...],
       "relative_humidity_2m": [...],
       "weather_code": [...],
       "wind_speed_10m": [...]
     }
   }
   ```

## Запуск приложения

### Предварительные требования
- Docker и Docker Compose установлены на вашей системе
- Порты 3000 (фронтенд) и 8000 (бэкенд) свободны

### Запуск через Docker Compose

1. **Клонируйте репозиторий:**
   ```bash
   git clone https://github.com/GosMan270/GMWee_SERVICE.git
   cd GMWee_SERVICE
   ```

2. **Создайте или проверьте файл `docker-compose.yml`:**
   ```yaml
   version: '3.8'

   services:
     backend:
       build:
         context: ./api_for_metio_site
         dockerfile: Dockerfile
       container_name: weather_backend
       ports:
         - "8000:8000"
       restart: unless-stopped
       volumes:
         - ./backend/data:/app/data

     frontend:
       build:
         context: ./metio_site
         dockerfile: Dockerfile
       container_name: weather_frontend
       ports:
         - "3000:3000"
       restart: unless-stopped
       depends_on:
         - backend
       environment:
         - NEXT_PUBLIC_API_URL=http://backend:8000
   ```

3. **Запустите приложение:**
   ```bash
   docker-compose up --build
   ```

4. **Откройте в браузере:**
   - Фронтенд: http://localhost:3000
   - API документация: http://localhost:8000/docs

### Остановка приложения

```bash
# Остановка контейнеров
docker-compose down

# Остановка с удалением volumes (данных)
docker-compose down -v
```

## Технологический стек

### Frontend
- **Next.js** - React фреймворк
- **React** - UI библиотека
- **localStorage** - хранение истории поиска
- **Cookies** - сохранение user ID и последнего города

### Backend
- **FastAPI** - веб-фреймворк
- **SQLite + aiosqlite** - база данных
- **aiohttp** - асинхронные HTTP запросы
- **openmeteo_requests** - клиент для Open-Meteo API
- **pandas** - обработка временных данных

### Инфраструктура
- **Docker** - контейнеризация
- **Docker Compose** - оркестрация контейнеров

## База данных

### Таблица `users`
- `id` - идентификатор пользователя
- `last_city` - последний запрошенный город
- `timestamp` - время последнего запроса

### Таблица `sity` (cities)
- `city_name` - название города
- `request_count` - количество запросов

## Переменные окружения

### Frontend
- `NEXT_PUBLIC_API_URL` - URL бэкенда (по умолчанию: http://localhost:8000)

### Backend
- `DATABASE_URL` - путь к файлу базы данных (по умолчанию: ./data/weather.db)
- `CORS_ORIGINS` - разрешенные origins для CORS

## Разработка

### Локальный запуск без Docker

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Примеры использования

### PowerShell
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/weather/user123" `
                  -Method Post `
                  -ContentType "application/json" `
                  -Body '{"city": "Москва"}'
```

### cURL
```bash
curl -X POST "http://localhost:8000/weather/user123" \
     -H "Content-Type: application/json" \
     -d '{"city": "Москва"}'
```

## Дополнительные возможности (Roadmap)

- [x] Docker контейнеризация
- [x] Сохранение истории пользователей
- [x] Статистика по городам
- [ ] Автодополнение при вводе города
- [ ] Экспорт истории в CSV
- [ ] Многоязычная поддержка
- [ ] Push-уведомления о погоде
- [ ] Интеграция с другими погодными API

## Лицензия

MIT License

## Автор

GosMan270

---

Для получения дополнительной информации или сообщения об ошибках создайте issue в репозитории.