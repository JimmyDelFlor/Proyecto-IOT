from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle
import os

SCOPES = ['https://www.googleapis.com/auth/drive.file']
FOLDER_ID = "1CiauMvZxDbhv9rfAXBL3CTkKpVw3ZI8Q"

def upload_file(filename):
    creds = None

    if os.path.exists("token.pickle"):
        with open("token.pickle", "rb") as f:
            creds = pickle.load(f)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                "credentials.json", SCOPES
            )
            creds = flow.run_local_server(port=0)

        with open("token.pickle", "wb") as f:
            pickle.dump(creds, f)

    service = build("drive", "v3", credentials=creds)

    file_metadata = {
        "name": filename,
        "parents": [FOLDER_ID]
    }

    media = MediaFileUpload(filename, mimetype="audio/wav")

    service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id"
    ).execute()

    print("☁ Subido a Drive (carpeta ESP32_AUDIO)")
