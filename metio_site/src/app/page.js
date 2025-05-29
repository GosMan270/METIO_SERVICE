"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';

// Утилиты для работы с хранилищем
const storageUtils = {
  // Используем localStorage для больших данных
  setLocal: (key, value) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  },

  getLocal: (key) => {
    if (typeof window === 'undefined') return null;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error('Failed to read from localStorage:', e);
      return null;
    }
  },

  // Cookie только для небольших данных
  setCookie: (name, value, days = 7) => {
    if (typeof document === 'undefined') return;
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax`;
  },

  getCookie: (name) => {
    if (typeof document === 'undefined') return null;
    const nameEQ = `${name}=`;
    const cookies = document.cookie.split(';');

    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length));
      }
    }
    return null;
  }
};

// Генерация ID пользователя
const getUserId = () => {
  let userId = storageUtils.getCookie('userId');
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    storageUtils.setCookie('userId', userId, 365);
  }
  return userId;
};

// Иконки погоды
const weatherIcons = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
  80: '🌦️', 81: '🌦️', 82: '🌧️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️'
};

const getWeatherIcon = (code) => weatherIcons[code] || '🌡️';

// Работа с историей
const historyUtils = {
  get: () => {
    try {
      const data = storageUtils.getLocal('searchHistory');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  save: (history) => {
    if (!Array.isArray(history)) return;
    storageUtils.setLocal('searchHistory', history);
  },

  add: (city, currentHistory) => {
    if (!city || typeof city !== 'string') return currentHistory;

    const newHistory = [...currentHistory];
    const normalizedCity = city.trim();
    const existingIndex = newHistory.findIndex(
      item => item.city.toLowerCase() === normalizedCity.toLowerCase()
    );

    if (existingIndex !== -1) {
      newHistory[existingIndex] = {
        ...newHistory[existingIndex],
        city: normalizedCity,
        searched_at: new Date().toISOString(),
        count: (newHistory[existingIndex].count || 1) + 1
      };
    } else {
      newHistory.unshift({
        city: normalizedCity,
        searched_at: new Date().toISOString(),
        count: 1
      });
    }

    return newHistory
      .sort((a, b) => new Date(b.searched_at) - new Date(a.searched_at))
      .slice(0, 10);
  }
};

// Валидация данных погоды
const validateWeatherData = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (!data.current || typeof data.current !== 'object') return false;
  if (!data.hourly || typeof data.hourly !== 'object') return false;
  if (!Array.isArray(data.hourly.temperature_2m)) return false;
  if (!Array.isArray(data.hourly.weather_code)) return false;
  return true;
};

export default function WeatherApp() {
  const [city, setCity] = useState('');
  const [weather, setWeather] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId] = useState(() => getUserId());
  const [currentTime, setCurrentTime] = useState(new Date());

  const abortControllerRef = useRef(null);
  const mounted = useRef(true);

  // Обновляем время каждую минуту
  useEffect(() => {
    const timer = setInterval(() => {
      if (mounted.current) {
        setCurrentTime(new Date());
      }
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Инициализация
  useEffect(() => {
    const savedHistory = historyUtils.get();
    setHistory(savedHistory);

    const lastCity = storageUtils.getCookie('lastCity');
    if (lastCity) {
      setCity(lastCity);
    }
  }, []);

  // Сохранение истории
  useEffect(() => {
    if (history.length > 0) {
      historyUtils.save(history);
    }
  }, [history]);

  // Функция получения погоды
  const fetchWeather = useCallback(async (cityName) => {
    const searchCity = (cityName || city).trim();

    if (!searchCity) {
      setError('Введите название города');
      return;
    }

    // Отменяем предыдущий запрос
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Создаем новый контроллер
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError('');
    setWeather(null);

    try {
      const response = await fetch(`http://localhost:8000/weather/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ city: searchCity }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let errorMessage = `Ошибка сервера: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // Игнорируем ошибку парсинга JSON
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Валидация данных
      if (!validateWeatherData(data)) {
        throw new Error('Получены некорректные данные от сервера');
      }

      // Проверяем, что компонент еще смонтирован
      if (!mounted.current) return;

      setWeather(data);
      storageUtils.setCookie('lastCity', searchCity, 7);

      const newHistory = historyUtils.add(searchCity, history);
      setHistory(newHistory);
      setError('');

    } catch (err) {
      // Игнорируем отмененные запросы
      if (err.name === 'AbortError') {
        return;
      }

      if (!mounted.current) return;

      console.error('Ошибка:', err);

      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        setError('Не удалось подключиться к серверу. Убедитесь, что сервер запущен.');
      } else {
        setError(err.message || 'Произошла ошибка при получении данных');
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [city, history, userId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchWeather();
  };

  // Функция для безопасного получения данных из массива
  const safeArrayAccess = (arr, index, defaultValue = 0) => {
    return Array.isArray(arr) && arr[index] !== undefined ? arr[index] : defaultValue;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-indigo-600 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Заголовок */}
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-2 text-white">
            Прогноз погоды
          </h1>
          <p className="text-lg opacity-90 text-white">
            Узнайте погоду в любом городе мира
          </p>
        </header>

        {/* Форма поиска */}
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-8">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Введите название города..."
            className="flex-grow px-4 py-3 rounded-lg text-gray-900 bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-md"
            disabled={loading}
            maxLength={100}
          />
          <button
            type="submit"
            disabled={loading || !city.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed rounded-lg transition-colors shadow-md font-medium text-white"
          >
            {loading ? 'Загрузка...' : 'Найти'}
          </button>
        </form>

        {/* Кнопка последнего города */}
        {!weather && !loading && storageUtils.getCookie('lastCity') && (
          <div className="text-center mb-6">
            <button
              onClick={() => {
                const lastCity = storageUtils.getCookie('lastCity');
                if (lastCity) {
                  setCity(lastCity);
                  fetchWeather(lastCity);
                }
              }}
              className="px-6 py-3 bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg transition-all shadow-md font-medium text-white"
            >
              Показать погоду в: {storageUtils.getCookie('lastCity')}
            </button>
          </div>
        )}

        {/* Ошибка */}
        {error && (
          <div className="bg-red-500 bg-opacity-20 backdrop-blur-sm border border-red-300 text-red-100 p-4 rounded-lg mb-8">
            <p className="font-semibold">Ошибка</p>
            <p>{error}</p>
          </div>
        )}

        {/* Загрузка */}
        {loading && (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          </div>
        )}

        {/* Данные о погоде */}
        {weather && !loading && (
          <div className="bg-white rounded-xl shadow-xl overflow-hidden mb-8">
            {/* Заголовок с городом */}
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-blue-600">
              <h2 className="text-3xl font-bold capitalize text-white">
                {weather.city || 'Неизвестный город'}
              </h2>
              <p className="opacity-90 mt-2 text-white">
                {currentTime.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            {/* Почасовой прогноз */}
            {weather.hourly && Array.isArray(weather.hourly.temperature_2m) && (
              <div className="p-6 bg-white">
                <h3 className="text-xl font-semibold mb-4 text-gray-900">
                  Прогноз на 24 часа
                </h3>
                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-3 min-w-max">
                    {weather.hourly.temperature_2m.slice(0, 24).map((temp, index) => {
                      const currentHour = new Date().getHours();
                      const isCurrentHour = index === currentHour;

                      return (
                        <div
                          key={index}
                          className={`rounded-lg p-3 text-center min-w-[80px] border ${
                            isCurrentHour 
                              ? 'bg-blue-500 text-white border-blue-600' 
                              : 'bg-blue-50 border-blue-200'
                          }`}
                        >
                          <div className={`text-sm font-medium ${
                            isCurrentHour ? 'text-white' : 'text-gray-700'
                          }`}>
                            {index.toString().padStart(2, '0')}:00
                          </div>
                          <div className="text-2xl my-2">
                            {getWeatherIcon(safeArrayAccess(weather.hourly.weather_code, index, 0))}
                          </div>
                          <div className={`text-lg font-bold ${
                            isCurrentHour ? 'text-white' : 'text-gray-900'
                          }`}>
                            {Math.round(temp || 0)}°
                          </div>
                          <div className={`text-xs mt-1 ${
                            isCurrentHour ? 'text-white' : 'text-gray-600'
                          }`}>
                            💧 {safeArrayAccess(weather.hourly.relative_humidity_2m, index, 0)}%
                          </div>
                          <div className={`text-xs ${
                            isCurrentHour ? 'text-white' : 'text-gray-600'
                          }`}>
                            💨 {Math.round(safeArrayAccess(weather.hourly.wind_speed_10m, index, 0))} м/с
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* График температуры */}
            {weather.hourly && Array.isArray(weather.hourly.temperature_2m) && (
              <div className="p-6 bg-gray-50">
                <h3 className="text-xl font-semibold mb-4 text-gray-900">
                  График температуры
                </h3>
                <div className="bg-white rounded-lg p-4 shadow-inner">
                  <div className="h-48 flex items-end justify-between gap-0.5">
                    {weather.hourly.temperature_2m.slice(0, 24).map((temp, index) => {
                      const temps = weather.hourly.temperature_2m.slice(0, 24).filter(t => t !== null && t !== undefined);
                      const maxTemp = Math.max(...temps);
                      const minTemp = Math.min(...temps);
                      const range = maxTemp - minTemp || 1;
                      const height = ((temp - minTemp) / range) * 90;
                      const currentHour = new Date().getHours();
                      const isCurrentHour = index === currentHour;

                      return (
                        <div key={index} className="flex-1 flex flex-col items-center justify-end h-full group">
                          <div className="w-full flex flex-col items-center justify-end h-full relative">
                            <span className="text-xs font-bold text-gray-800 mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4">
                              {Math.round(temp)}°
                            </span>
                            <div
                              className={`w-full ${
                                isCurrentHour 
                                  ? 'bg-blue-600' 
                                  : 'bg-blue-500 hover:bg-blue-600'
                              } transition-colors rounded-t`}
                              style={{
                                height: `${Math.max(height, 10)}%`,
                                minHeight: '4px'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between mt-2 text-xs text-gray-600">
                    {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
                      <span key={hour}>{hour.toString().padStart(2, '0')}:00</span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex justify-between text-sm text-gray-700 font-medium">
                  <span>
                    Мин: {Math.round(Math.min(...(weather.hourly.temperature_2m?.slice(0, 24).filter(t => t !== null) || [0])))}°C
                  </span>
                  <span>
                    Макс: {Math.round(Math.max(...(weather.hourly.temperature_2m?.slice(0, 24).filter(t => t !== null) || [0])))}°C
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* История поиска */}
        {history.length > 0 && !loading && (
          <div className="bg-white rounded-xl shadow-xl p-6">
            <h3 className="text-xl font-semibold mb-4 text-gray-900">
              История поиска
            </h3>
            <div className="space-y-2">
              {history.map((item, index) => (
                <div
                  key={`${item.city}-${index}`}
                  onClick={() => {
                    setCity(item.city);
                    fetchWeather(item.city);
                  }}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all cursor-pointer"
                >
                  <div>
                    <span className="font-medium capitalize text-gray-900">
                      {item.city}
                    </span>
                    {item.count > 1 && (
                      <span className="ml-2 text-xs text-gray-500">
                        ({item.count} раз)
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-600">
                    {new Date(item.searched_at).toLocaleString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setHistory([]);
                storageUtils.setLocal('searchHistory', []);
              }}
              className="mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Очистить историю
            </button>
          </div>
        )}
      </div>
    </div>
  );
}