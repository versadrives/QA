import pytest
from run_app import app


@pytest.fixture
def client():
    with app.test_client() as client:
        yield client

def test_index(client):
    rv = client.get('/')
    assert rv.status_code == 200
    assert b'scans' in rv.data

def test_export_requires_dates(client):
    rv = client.get('/export')
    assert rv.status_code == 400
