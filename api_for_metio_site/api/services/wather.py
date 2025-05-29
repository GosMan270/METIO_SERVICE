import openmeteo_requests
import aiohttp
import pandas as pd
import requests_cache

from datetime import datetime
from fastapi import HTTPException
from retry_requests import retry

from api.base.database_func import DATABASE


class Wather():
    async def wather_info(self, city):
        """Запрос к https://open-meteo.com/"""
        cache_session = requests_cache.CachedSession('.cache', expire_after=3600)
        retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
        openmeteo = openmeteo_requests.Client(session=retry_session)

        coords = await self.geocode_city(city)

        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": coords['lat'],
            "longitude": coords['lon'],
            "hourly": ["temperature_2m", "relative_humidity_2m", "weather_code", "wind_speed_10m"],
            "timezone": "auto"
        }

        responses = openmeteo.weather_api(url, params=params)
        response = responses[0]
        print(f"Coordinates {response.Latitude()}°N {response.Longitude()}°E")
        print(f"Elevation {response.Elevation()} m asl")
        print(f"Timezone {response.Timezone()}{response.TimezoneAbbreviation()}")
        print(f"Timezone difference to GMT+0 {response.UtcOffsetSeconds()} s")

        hourly = response.Hourly()
        hourly_temperature_2m = hourly.Variables(0).ValuesAsNumpy()
        hourly_relative_humidity_2m = hourly.Variables(1).ValuesAsNumpy()
        hourly_weather_code = hourly.Variables(2).ValuesAsNumpy()
        hourly_wind_speed_10m = hourly.Variables(3).ValuesAsNumpy()

        hourly_data = {"date": pd.date_range(
            start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
            end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
            freq=pd.Timedelta(seconds=hourly.Interval()),
            inclusive="left"
        )}

        return {
            "temperature_2m": hourly_temperature_2m.tolist(),
            "relative_humidity_2m": hourly_relative_humidity_2m.tolist(),
            "weather_code": hourly_weather_code.tolist(),
            "wind_speed_10m": hourly_wind_speed_10m.tolist(),
            "time": hourly_data["date"].strftime('%Y-%m-%d %H:%M').tolist()
        }

    async def geocode_city(self, city_name):
        """Получение координат"""
        async with aiohttp.ClientSession() as session:
            url = "https://nominatim.openstreetmap.org/search"
            params = {
                "q": city_name,
                "format": "json",
                "limit": 1,
            }

            headers = {"User-Agent": "myweatherapp/1.0 your@email.com"}
            async with session.get(url, params=params, headers=headers) as resp:
                data = await resp.json()
                if isinstance(data, list) and data:
                    result = {
                        'lat': float(data[0]["lat"]),
                        'lon': float(data[0]["lon"]),
                    }

                    return result
                if not (isinstance(data, list) and data):
                    raise HTTPException(status_code=404, detail="Город не найден")

    async def output_sity_info(self, sity, user_id):
        """Вывод данных в json"""
        await DATABASE.add_history(sity, user_id)
        weather_data_raw = await self.wather_info(sity)

        weather_data = {
            "city": sity,
            "current": {
                "temperature": float(weather_data_raw["temperature_2m"][datetime.now().hour]) if weather_data_raw[
                    "temperature_2m"] else 0,
                "humidity": int(weather_data_raw["relative_humidity_2m"][datetime.now().hour]) if weather_data_raw[
                    "relative_humidity_2m"] else 0,
                "wind_speed": float(weather_data_raw["wind_speed_10m"][datetime.now().hour]) if weather_data_raw[
                    "wind_speed_10m"] else 0,
                "weather_code": int(weather_data_raw["weather_code"][datetime.now().hour]) if weather_data_raw[
                    "weather_code"] else 0
            },
            "hourly": {
                "temperature_2m": weather_data_raw["temperature_2m"][:24] if
                weather_data_raw["temperature_2m"] else [],
                "relative_humidity_2m": weather_data_raw["relative_humidity_2m"][:24] if
                weather_data_raw["relative_humidity_2m"] else [],
                "weather_code": weather_data_raw["weather_code"][:24] if
                weather_data_raw["weather_code"] else [],
                "wind_speed_10m": weather_data_raw["wind_speed_10m"][:24] if
                weather_data_raw["wind_speed_10m"] else []
            }
        }
        return weather_data


WATHER = Wather()