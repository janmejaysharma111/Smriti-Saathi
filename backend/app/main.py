from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated, Any
from uuid import UUID, uuid4

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Integer, JSON, String, UniqueConstraint, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from starlette.middleware.cors import CORSMiddleware


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./smriti_saathi.db")
JWT_SECRET = os.getenv("JWT_SECRET", "local-development-only-change-before-deployment")
JWT_ALGORITHM = "HS256"
TOKEN_LIFETIME_MINUTES = 60

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
passwords = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


class Role(str, Enum):
    patient = "patient"
    caregiver = "caregiver"
    observer = "observer"


class LinkStatus(str, Enum):
    pending = "pending"
    active = "active"
    rejected = "rejected"


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[Role] = mapped_column(SqlEnum(Role, native_enum=False), index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CareLink(Base):
    __tablename__ = "care_links"
    __table_args__ = (UniqueConstraint("patient_id", "member_id", name="uq_patient_member"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    member_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[LinkStatus] = mapped_column(SqlEnum(LinkStatus, native_enum=False), default=LinkStatus.pending)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Score(Base):
    __tablename__ = "scores"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    activity: Mapped[str] = mapped_column(String(120), index=True)
    value: Mapped[int] = mapped_column(Integer)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(
    title="Smriti Saathi API",
    description="Accounts, patient-care-team links, and memory activity scores.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:8081,http://localhost:19006"
    ).split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


Db = Annotated[Session, Depends(get_db)]


class RegisterInput(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    role: Role
    password: str = Field(min_length=10, max_length=128)


class UserView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: EmailStr
    name: str
    role: Role
    created_at: datetime


class TokenView(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LinkInput(BaseModel):
    patient_email: EmailStr


class LinkView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    patient_id: UUID
    member_id: UUID
    status: LinkStatus
    created_at: datetime


class LinkedPersonView(BaseModel):
    link_id: UUID
    status: LinkStatus
    person: UserView


class ScoreInput(BaseModel):
    activity: str = Field(min_length=1, max_length=120)
    value: int = Field(ge=0, le=1_000_000)
    details: dict[str, Any] = Field(default_factory=dict)
    recorded_at: datetime | None = None


class ScoreView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    patient_id: UUID
    activity: str
    value: int
    details: dict[str, Any]
    recorded_at: datetime


def current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Db) -> User:
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise invalid
    user = db.get(User, user_id)
    if user is None:
        raise invalid
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(user: User, *roles: Role) -> None:
    if user.role not in roles:
        raise HTTPException(status_code=403, detail="This action is not available for your role")


def can_view_patient(db: Session, user: User, patient_id: UUID) -> bool:
    if user.role == Role.patient and user.id == patient_id:
        return True
    return db.scalar(
        select(CareLink.id).where(
            CareLink.patient_id == patient_id,
            CareLink.member_id == user.id,
            CareLink.status == LinkStatus.active,
        )
    ) is not None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register", response_model=UserView, status_code=201)
def register(body: RegisterInput, db: Db):
    email = str(body.email).lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=email, name=body.name.strip(), role=body.role, password_hash=passwords.hash(body.password))
    if not user.name:
        raise HTTPException(status_code=422, detail="Name cannot be blank")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/token", response_model=TokenView)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: Db):
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if user is None or not passwords.verify(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    token = jwt.encode(
        {"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_LIFETIME_MINUTES)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    return TokenView(access_token=token)


@app.get("/auth/me", response_model=UserView)
def me(user: CurrentUser):
    return user


@app.post("/relationships", response_model=LinkView, status_code=201)
def request_link(body: LinkInput, user: CurrentUser, db: Db):
    require_role(user, Role.caregiver, Role.observer)
    patient = db.scalar(select(User).where(User.email == str(body.patient_email).lower()))
    if patient is None or patient.role != Role.patient:
        raise HTTPException(status_code=404, detail="No patient account found for that email")
    existing = db.scalar(select(CareLink).where(CareLink.patient_id == patient.id, CareLink.member_id == user.id))
    if existing:
        if existing.status == LinkStatus.rejected:
            existing.status = LinkStatus.pending
            db.commit()
            db.refresh(existing)
        else:
            raise HTTPException(status_code=409, detail="A relationship request already exists")
        return existing
    link = CareLink(patient_id=patient.id, member_id=user.id)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@app.get("/relationships/requests", response_model=list[LinkedPersonView])
def relationship_requests(user: CurrentUser, db: Db):
    require_role(user, Role.patient)
    links = db.scalars(select(CareLink).where(CareLink.patient_id == user.id, CareLink.status == LinkStatus.pending)).all()
    return [LinkedPersonView(link_id=link.id, status=link.status, person=db.get(User, link.member_id)) for link in links]


@app.post("/relationships/{link_id}/accept", response_model=LinkView)
def accept_relationship(link_id: UUID, user: CurrentUser, db: Db):
    require_role(user, Role.patient)
    link = db.get(CareLink, link_id)
    if link is None or link.patient_id != user.id:
        raise HTTPException(status_code=404, detail="Relationship request not found")
    if link.status != LinkStatus.pending:
        raise HTTPException(status_code=409, detail="This request is no longer pending")
    link.status = LinkStatus.active
    db.commit()
    db.refresh(link)
    return link


@app.post("/relationships/{link_id}/reject", response_model=LinkView)
def reject_relationship(link_id: UUID, user: CurrentUser, db: Db):
    require_role(user, Role.patient)
    link = db.get(CareLink, link_id)
    if link is None or link.patient_id != user.id:
        raise HTTPException(status_code=404, detail="Relationship request not found")
    if link.status != LinkStatus.pending:
        raise HTTPException(status_code=409, detail="This request is no longer pending")
    link.status = LinkStatus.rejected
    db.commit()
    db.refresh(link)
    return link


@app.get("/relationships", response_model=list[LinkedPersonView])
def list_relationships(user: CurrentUser, db: Db, include_pending: bool = Query(default=False)):
    if user.role == Role.patient:
        query = select(CareLink).where(CareLink.patient_id == user.id)
        if not include_pending:
            query = query.where(CareLink.status == LinkStatus.active)
        links = db.scalars(query).all()
        return [LinkedPersonView(link_id=link.id, status=link.status, person=db.get(User, link.member_id)) for link in links]
    links = db.scalars(select(CareLink).where(CareLink.member_id == user.id)).all()
    return [LinkedPersonView(link_id=link.id, status=link.status, person=db.get(User, link.patient_id)) for link in links]


@app.post("/patients/{patient_id}/scores", response_model=ScoreView, status_code=201)
def record_score(patient_id: UUID, body: ScoreInput, user: CurrentUser, db: Db):
    require_role(user, Role.patient)
    if user.id != patient_id:
        raise HTTPException(status_code=403, detail="Patients can only submit their own scores")
    score = Score(
        patient_id=patient_id,
        activity=body.activity.strip(),
        value=body.value,
        details=body.details,
        recorded_at=body.recorded_at or datetime.now(timezone.utc),
    )
    if not score.activity:
        raise HTTPException(status_code=422, detail="Activity cannot be blank")
    db.add(score)
    db.commit()
    db.refresh(score)
    return score


@app.get("/patients/{patient_id}/scores", response_model=list[ScoreView])
def list_scores(
    patient_id: UUID,
    user: CurrentUser,
    db: Db,
    activity: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    if not can_view_patient(db, user, patient_id):
        raise HTTPException(status_code=403, detail="You do not have access to this patient's records")
    query = select(Score).where(Score.patient_id == patient_id)
    if activity:
        query = query.where(Score.activity == activity)
    return db.scalars(query.order_by(Score.recorded_at.desc()).offset(offset).limit(limit)).all()
