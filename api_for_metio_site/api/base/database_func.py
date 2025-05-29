import aiosqlite
from typing import Optional, List, Tuple, Any
from contextlib import asynccontextmanager
import asyncio


class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._last_row_id: int = 0

    @asynccontextmanager
    async def get_connection(self):
        """Контекстный менеджер для автоматического управления соединением"""
        async with aiosqlite.connect(self.db_path) as connection:
            await connection.execute("PRAGMA journal_mode=WAL")
            yield connection

    async def execute_query(self, query: str, params: Optional[Tuple] = None) -> None:
        """Выполняет запрос без возврата результата (INSERT, UPDATE, DELETE)"""
        async with self.get_connection() as connection:
            cursor = await connection.execute(query, params or ())
            await connection.commit()
            self._last_row_id = cursor.lastrowid

    async def execute_get_query(self, query: str, params: Optional[Tuple] = None) -> List[aiosqlite.Row]:
        """Выполняет SELECT запрос и возвращает результаты"""
        async with self.get_connection() as connection:
            # Включаем Row factory для удобной работы с результатами
            connection.row_factory = aiosqlite.Row
            cursor = await connection.execute(query, params or ())
            return await cursor.fetchall()

    async def execute_get_one(self, query: str, params: Optional[Tuple] = None) -> Optional[aiosqlite.Row]:
        """Выполняет SELECT запрос и возвращает одну строку"""
        async with self.get_connection() as connection:
            connection.row_factory = aiosqlite.Row
            cursor = await connection.execute(query, params or ())
            return await cursor.fetchone()

    @property
    def last_id(self) -> int:
        return self._last_row_id


class ProjectDatabase(Database):
    def __init__(self, db_path: str = "database.db"):
        super().__init__(db_path)
        self._initialized = False

    async def ensure_initialized(self):
        """Убеждается, что таблицы инициализированы"""
        if not self._initialized:
            await self.initialize_tables()
            self._initialized = True

    async def initialize_tables(self):
        """Создает таблицы если их нет"""
        async with self.get_connection() as connection:
            await connection.executescript("""
                CREATE TABLE IF NOT EXISTS users(
                    id TEXT PRIMARY KEY,
                    sity TEXT
                );

                CREATE TABLE IF NOT EXISTS sity(
                    sity_name TEXT PRIMARY KEY,
                    call BIGINT NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
                CREATE INDEX IF NOT EXISTS idx_sity_name ON sity(sity_name);
            """)
            await connection.commit()
            print("Database tables initialized successfully!")
            self._initialized = True

    async def get_user_history(self, user_id: str) -> List[aiosqlite.Row]:
        """Получает историю пользователя"""
        await self.ensure_initialized()
        return await self.execute_get_query(
            "SELECT * FROM users WHERE id = ?",
            (user_id,)
        )

    async def add_history(self, sity: str, user_id: str) -> None:
        """Добавляет город в историю"""
        await self.ensure_initialized()
        await self.execute_query(
            "INSERT OR REPLACE INTO users(id, sity) VALUES (?, ?)",
            (user_id, sity)
        )

    async def add_new_sity(self, sity_name: str):
        """Проверяет город и добавляет или обновляет счетчик"""
        await self.ensure_initialized()
        res = await self.execute_get_query(
            "SELECT * FROM sity WHERE sity_name = ?",
            (sity_name,)
        )
        if len(res) == 0:
            await self.execute_query(
                "INSERT INTO sity(sity_name, call) VALUES (?, ?)",
                (sity_name, 1)
            )
        else:
            await self.execute_query(
                "UPDATE sity SET call = call + 1 WHERE sity_name = ?",
                (sity_name,)
            )


DATABASE = ProjectDatabase('database.db')


async def init_database():
    """Инициализирует базу данных"""
    await DATABASE.initialize_tables()

async def main():
    await init_database()

if __name__ == "__main__":
    asyncio.run(main())