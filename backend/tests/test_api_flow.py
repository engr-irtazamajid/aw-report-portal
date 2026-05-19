import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./data/test_api_flow.db")


import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool

from app.db import session as db_session
from app.db.base import Base


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("data") / "test.db"
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    db_session.engine = engine
    db_session.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    from app.main import create_app

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _login(client: TestClient) -> str:
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@windbrook.app", "password": "ChangeMe!2026"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def test_health(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_login_required_for_clients(client: TestClient):
    response = client.get("/api/v1/clients")
    assert response.status_code == 401


def test_login_rejects_bad_credentials(client: TestClient):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@windbrook.app", "password": "wrong-password!"},
    )
    assert response.status_code == 401


def test_full_client_and_report_flow(client: TestClient):
    token = _login(client)
    auth = {"Authorization": f"Bearer {token}"}

    payload = {
        "primary_first_name": "John",
        "primary_last_name": "Doe",
        "primary_dob": "1980-01-01",
        "primary_ssn_last4": "1234",
        "spouse_first_name": "Jane",
        "spouse_last_name": "Doe",
        "spouse_dob": "1982-05-01",
        "spouse_ssn_last4": "5678",
        "monthly_inflow": 15000,
        "monthly_outflow_budget": 11000,
        "private_reserve_target_override": None,
        "floor_amount": 1000,
        "accounts": [
            {
                "owner": "primary",
                "category": "retirement",
                "account_type": "ira",
                "institution": "Schwab",
                "last_four": "1111",
                "label": "Primary IRA",
            },
            {
                "owner": "primary",
                "category": "retirement",
                "account_type": "roth_ira",
                "institution": "Schwab",
                "last_four": "2222",
                "label": "Primary Roth",
            },
            {
                "owner": "spouse",
                "category": "retirement",
                "account_type": "ira",
                "institution": "Schwab",
                "last_four": "3333",
                "label": "Spouse IRA",
            },
            {
                "owner": "joint",
                "category": "non_retirement",
                "account_type": "joint",
                "institution": "Schwab",
                "last_four": "4444",
                "label": "Joint Brokerage",
            },
        ],
        "liabilities": [
            {
                "liability_type": "mortgage",
                "label": "Primary Mortgage",
                "interest_rate": 3.5,
                "last_four": "9999",
            }
        ],
        "trust_properties": [
            {"label": "Primary Residence", "address": "123 Main St", "notes": None}
        ],
        "deductibles": [
            {"label": "Auto", "amount": 1000},
            {"label": "Home", "amount": 500},
        ],
    }

    create = client.post("/api/v1/clients", json=payload, headers=auth)
    assert create.status_code == 201, create.text
    client_detail = create.json()
    assert client_detail["primary_ssn_last4_masked"] == "*****1234"

    list_resp = client.get("/api/v1/clients", headers=auth)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    accounts = client_detail["accounts"]
    primary_ira = next(a for a in accounts if a["label"] == "Primary IRA")
    primary_roth = next(a for a in accounts if a["label"] == "Primary Roth")
    spouse_ira = next(a for a in accounts if a["label"] == "Spouse IRA")
    joint = next(a for a in accounts if a["label"] == "Joint Brokerage")
    trust = client_detail["trust_properties"][0]
    liability = client_detail["liabilities"][0]

    balances = [
        {"kind": "account", "target_id": primary_ira["id"], "field_key": f"account_{primary_ira['id']}", "amount": 11000},
        {"kind": "account", "target_id": primary_roth["id"], "field_key": f"account_{primary_roth['id']}", "amount": 15000},
        {"kind": "account", "target_id": spouse_ira["id"], "field_key": f"account_{spouse_ira['id']}", "amount": 22000},
        {"kind": "account", "target_id": joint["id"], "field_key": f"account_{joint['id']}", "amount": 50000},
        {"kind": "trust", "target_id": trust["id"], "field_key": f"trust_{trust['id']}", "amount": 450000},
        {"kind": "liability", "target_id": liability["id"], "field_key": f"liability_{liability['id']}", "amount": 200000},
        {"kind": "private_reserve", "target_id": None, "field_key": "private_reserve", "amount": 18000},
        {"kind": "schwab_cash", "target_id": None, "field_key": "schwab_cash", "amount": 5000},
    ]

    draft = client.post(
        f"/api/v1/clients/{client_detail['id']}/reports",
        json={"period_label": "Q2 2026", "balances": balances},
        headers=auth,
    )
    assert draft.status_code == 201, draft.text
    report = draft.json()
    assert report["status"] == "draft"

    totals = report["totals"]
    assert totals["sacs_inflow"] == 15000
    assert totals["sacs_outflow"] == 11000
    assert totals["sacs_excess"] == 4000
    assert totals["sacs_private_reserve_target"] == 67500
    assert totals["tcc_client1_retirement_total"] == 26000
    assert totals["tcc_client2_retirement_total"] == 22000
    assert totals["tcc_non_retirement_total"] == 50000
    assert totals["tcc_trust_total"] == 450000
    assert totals["tcc_grand_total"] == 548000
    assert totals["tcc_liabilities_total"] == 200000

    finalize = client.post(
        f"/api/v1/reports/{report['id']}/finalize",
        json={"balances": balances},
        headers=auth,
    )
    assert finalize.status_code == 200, finalize.text
    finalized = finalize.json()
    assert finalized["status"] == "final"

    last = client.get(f"/api/v1/clients/{client_detail['id']}/last-balances", headers=auth)
    assert last.status_code == 200
    by_key = last.json()["by_field_key"]
    assert by_key[f"account_{primary_ira['id']}"] == 11000

    sacs_pdf = client.get(
        f"/api/v1/reports/{report['id']}/pdf",
        params={"type": "sacs"},
        headers=auth,
    )
    assert sacs_pdf.status_code == 200
    assert sacs_pdf.headers["content-type"] == "application/pdf"
    assert len(sacs_pdf.content) > 1000

    tcc_pdf = client.get(
        f"/api/v1/reports/{report['id']}/pdf",
        params={"type": "tcc"},
        headers=auth,
    )
    assert tcc_pdf.status_code == 200
    assert len(tcc_pdf.content) > 1000

    duplicate = client.post(
        f"/api/v1/reports/{report['id']}/finalize",
        json={"balances": balances},
        headers=auth,
    )
    assert duplicate.status_code == 409
