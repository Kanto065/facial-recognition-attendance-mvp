"""
Generates a self-signed TLS certificate + key for local/LAN HTTPS.

Browsers only expose getUserMedia() in a "secure context" (https://, or
http://localhost). Serving over plain http:// from a server IP/hostname
breaks the webcam. This script produces cert.pem/key.pem that uvicorn can
use with --ssl-certfile/--ssl-keyfile.

Usage:
    venv\\Scripts\\python.exe generate_cert.py [extra-hostname-or-ip ...]

Example (also cover the LAN IP clients will actually browse to):
    venv\\Scripts\\python.exe generate_cert.py 192.168.1.50 myserver
"""

import datetime
import ipaddress
import sys
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

CERT_DIR = Path(__file__).parent / "certs"
CERT_DIR.mkdir(exist_ok=True)

extra_names = sys.argv[1:]

san_entries = [
    x509.DNSName("localhost"),
    x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
]
for name in extra_names:
    try:
        san_entries.append(x509.IPAddress(ipaddress.ip_address(name)))
    except ValueError:
        san_entries.append(x509.DNSName(name))

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Facial Recognition Attendance (self-signed)")])

cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
    .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=825))
    .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
    .sign(key, hashes.SHA256())
)

key_path = CERT_DIR / "key.pem"
cert_path = CERT_DIR / "cert.pem"

key_path.write_bytes(
    key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
)
cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))

print(f"Wrote {cert_path}")
print(f"Wrote {key_path}")
print("Covered names:", ", ".join(str(e.value) for e in san_entries))
