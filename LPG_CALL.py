import os
import time
from datetime import datetime, timedelta
from flask import Flask, request, Response, jsonify
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import plivo
import threading

# Config (set env vars)
PLIVO_AUTH_ID = os.environ['MANWFKMZGYOWUTNJJHYY']
PLIVO_AUTH_TOKEN = os.environ['YWQzMWEwOWMtMzlhYS00MDEzLTc5ZjItY2QyNzU4']
PLIVO_NUMBER = os.environ['PLIVO_NUMBER']  # your Plivo caller id
HOSTED_AUDIO = os.environ.get('HOSTED_AUDIO')  # e.g. https://.../kyc_msg.mp3
RETRY_DELAY_MINUTES = int(os.environ.get('RETRY_DELAY_MINUTES', '30'))
MAX_ATTEMPTS = int(os.environ.get('MAX_ATTEMPTS', '5'))
DB_URL = os.environ.get('DB_URL', 'sqlite:///calls.db')

app = Flask(__name__)
client = plivo.RestClient(auth_id=PLIVO_AUTH_ID, auth_token=PLIVO_AUTH_TOKEN)

# DB
Base = declarative_base()
engine = create_engine(DB_URL, echo=False, connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)

class CallJob(Base):
    __tablename__ = 'call_jobs'
    id = Column(Integer, primary_key=True)
    phone = Column(String, nullable=False)
    attempts = Column(Integer, default=0)
    last_status = Column(String, nullable=True)
    next_attempt = Column(DateTime, default=datetime.utcnow)
    done = Column(Boolean, default=False)
    call_uuid = Column(String, nullable=True)

Base.metadata.create_all(engine)

# Plivo answer URL: returns XML to play hosted audio
@app.route('/answer', methods=['GET','POST'])
def answer():
    xml = f"""<Response><Play>{HOSTED_AUDIO}</Play></Response>"""
    return Response(xml, mimetype='text/xml')

# Plivo status callback
@app.route('/call_status', methods=['POST','GET'])
def call_status():
    # Plivo sends params as form
    params = request.values.to_dict()
    call_uuid = params.get('CallUUID') or params.get('CallUUID'.lower())
    call_status = params.get('CallStatus') or params.get('CallStatus'.lower()) or params.get('CallStatus'.upper())
    duration = int(params.get('Duration') or params.get('CallDuration') or 0)
    to_number = params.get('To')
    # record in DB
    db = Session()
    job = db.query(CallJob).filter(CallJob.call_uuid == call_uuid).first()
    if not job and to_number:
        job = db.query(CallJob).filter(CallJob.phone == to_number).order_by(CallJob.id.desc()).first()
    if job:
        job.last_status = call_status
        job.call_uuid = call_uuid
        # If answered and long enough, mark done
        if call_status == 'completed' and duration >= 1800:
            job.done = True
        else:
            # schedule retry if attempts < MAX_ATTEMPTS
            job.attempts = (job.attempts or 0)
            if (call_status in ('no-answer','busy','failed')) or (call_status == 'completed' and duration < 1800):
                if job.attempts < MAX_ATTEMPTS:
                    job.next_attempt = datetime.utcnow() + timedelta(minutes=RETRY_DELAY_MINUTES)
                else:
                    job.done = True
            elif call_status == 'completed' and duration >= 1800:
                job.done = True
        db.add(job)
        db.commit()
    db.close()
    return ('', 204)

# API to enqueue initial customers (simple)
@app.route('/enqueue', methods=['POST'])
def enqueue():
    data = request.get_json()
    phones = data.get('phones', [])
    db = Session()
    added = 0
    for p in phones:
        exists = db.query(CallJob).filter(CallJob.phone == p, CallJob.done == False).first()
        if not exists:
            job = CallJob(phone=p, next_attempt=datetime.utcnow(), attempts=0)
            db.add(job); added += 1
    db.commit(); db.close()
    return jsonify({"enqueued": added})

# Worker that picks due jobs and places calls
def worker_loop(poll_seconds=10, batch_size=10):
    while True:
        try:
            db = Session()
            now = datetime.utcnow()
            jobs = db.query(CallJob).filter(CallJob.done==False, CallJob.next_attempt<=now).order_by(CallJob.next_attempt).limit(batch_size).all()
            for job in jobs:
                # place call
                try:
                    resp = client.calls.create(
                        from_=PLIVO_NUMBER,
                        to_=job.phone,
                        answer_url=f'{os.environ.get("PUBLIC_BASE")}/answer',
                        answer_method='GET',
                        hangup_url=f'{os.environ.get("PUBLIC_BASE")}/call_status',
                        # status_callback is vendor-specific; Plivo sends several callbacks — ensure your Plivo app is configured to use this URL
                        # you may set 'url' and 'answer_method' etc. Adjust as per your Plivo app setup.
                        )
                    job.call_uuid = resp['request_uuid'] if isinstance(resp, dict) else getattr(resp, 'request_uuid', None)
                    job.attempts = (job.attempts or 0) + 1
                    job.next_attempt = datetime.utcnow() + timedelta(minutes=RETRY_DELAY_MINUTES)  # set tentative; status callback will adjust
                    db.add(job); db.commit()
                except Exception as e:
                    # schedule retry on error
                    job.attempts = (job.attempts or 0) + 1
                    if job.attempts < MAX_ATTEMPTS:
                        job.next_attempt = datetime.utcnow() + timedelta(minutes=RETRY_DELAY_MINUTES)
                    else:
                        job.done = True
                    db.add(job); db.commit()
            db.close()
        except Exception as ex:
            print("Worker error:", ex)
        time.sleep(poll_seconds)

if __name__ == '__main__':
    # start background worker thread
    t = threading.Thread(target=worker_loop, kwargs={'poll_seconds':5,'batch_size':5}, daemon=True)
    t.start()
    app.run(host='0.0.0.0', port=5000)
