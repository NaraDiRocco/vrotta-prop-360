#!/usr/bin/env python3
"""Recibe los leads del recorrido y los deja escritos en disco.

El visor manda cada contacto por POST /api/leads contra su mismo origen y no
espera respuesta (`contact.ts`: sendBeacon, disparar y olvidar). Si nadie
atiende ese endpoint el lead se pierde en silencio y nadie se entera: no hay
error visible para el visitante ni aviso para nosotros. Este servicio es el
que atiende.

Guarda una linea JSON por lead en leads.jsonl, con fsync, porque un lead
perdido es una venta perdida. Sin base de datos ni dependencias a proposito:
lo importante es que esto no se caiga nunca y que el archivo se pueda leer
con un cat.

No guarda la IP del visitante: no la necesitamos para nada y es dato personal
de mas.
"""

import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DESTINO = os.environ.get("LEADS_ARCHIVO", "/data/leads.jsonl")
PUERTO = int(os.environ.get("LEADS_PUERTO", "8080"))
MAX_CUERPO = 8 * 1024  # un lead son unos cientos de bytes; mas es basura


def anotar(registro: dict) -> None:
    linea = json.dumps(registro, ensure_ascii=False) + "\n"
    with open(DESTINO, "a", encoding="utf-8") as f:
        f.write(linea)
        f.flush()
        os.fsync(f.fileno())


class Receptor(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _responder(self, codigo: int) -> None:
        self.send_response(codigo)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/api/leads":
            self._responder(404)
            return

        try:
            largo = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            largo = 0
        if largo <= 0 or largo > MAX_CUERPO:
            self._responder(400)
            return

        try:
            crudo = self.rfile.read(largo)
            payload = json.loads(crudo.decode("utf-8"))
        except Exception:
            self._responder(400)
            return

        try:
            anotar(
                {
                    "recibido": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "lead": payload,
                    "agente": (self.headers.get("User-Agent") or "")[:200],
                }
            )
        except Exception as e:  # el disco puede fallar; el visitante no tiene la culpa
            print(f"ERROR al anotar el lead: {e}", file=sys.stderr, flush=True)
            self._responder(500)
            return

        # 204: el visor no lee la respuesta, pero un cuerpo vacio es lo correcto.
        self._responder(204)

    def do_GET(self) -> None:  # noqa: N802
        # Para que el chequeo de salud no ensucie el log de errores.
        self._responder(204 if self.path == "/salud" else 404)

    def log_message(self, formato: str, *args) -> None:
        # Sin log de acceso: no queremos un registro paralelo de quien contacta.
        pass


if __name__ == "__main__":
    os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
    print(f"receptor de leads escuchando en :{PUERTO}, escribiendo en {DESTINO}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PUERTO), Receptor).serve_forever()
