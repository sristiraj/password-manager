from pydantic import BaseModel
from typing import Optional


class UnlockRequest(BaseModel):
    master_password: str


class UnlockResponse(BaseModel):
    token: str


class EntryCreate(BaseModel):
    title: str
    username: Optional[str] = None
    password: Optional[str] = None
    secret: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None


class EntryUpdate(BaseModel):
    title: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    secret: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None


class Entry(BaseModel):
    id: int
    title: str
    username: Optional[str] = None
    password: Optional[str] = None
    secret: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None
