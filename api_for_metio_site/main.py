from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.services.wather import WATHER
from api.base.database_func import DATABASE

app = FastAPI()
router = APIRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CityRequest(BaseModel):
    city: str

@app.post('/weather/{user_id}')
async def get_weather(data: CityRequest, user_id: str):
    await DATABASE.add_history(data.city, user_id)
    await DATABASE.add_new_sity(data.city)
    info = await WATHER.output_sity_info(data.city, user_id)
    return info

@app.get("/")
async def root():
    return {"message": "Weather API: используйте POST /weather/{user_id} с {'city': 'Город'}"}

# Invoke-RestMethod -Uri "http://127.0.0.1:8000/weather/user123" -Method Post -ContentType "application/json" -Body '{"city": "Москва"}'