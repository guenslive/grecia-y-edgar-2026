"""Servidor local para ver la página.

    python3 servidor.py        →  http://localhost:8080

A diferencia de `python3 -m http.server`, este soporta peticiones por rangos
(Range), que el navegador necesita para adelantar o regresar la canción.
"""
import http.server
import os
import re
import sys

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Manejador(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        self._restante = None
        rango = self.headers.get("Range")
        ruta = self.translate_path(self.path)
        if not rango or not os.path.isfile(ruta):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rango)
        tam = os.path.getsize(ruta)
        if not m:
            return super().send_head()
        ini = int(m.group(1)) if m.group(1) else max(0, tam - int(m.group(2) or 0))
        fin = int(m.group(2)) if m.group(1) and m.group(2) else tam - 1
        if ini >= tam:
            self.send_error(416)
            return None
        fin = min(fin, tam - 1)
        f = open(ruta, "rb")
        f.seek(ini)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(ruta))
        self.send_header("Content-Range", f"bytes {ini}-{fin}/{tam}")
        self.send_header("Content-Length", str(fin - ini + 1))
        self.end_headers()
        self._restante = fin - ini + 1
        return f

    def copyfile(self, fuente, destino):
        restante = getattr(self, "_restante", None)
        if restante is None:
            return super().copyfile(fuente, destino)
        while restante > 0:
            bloque = fuente.read(min(64 * 1024, restante))
            if not bloque:
                break
            destino.write(bloque)
            restante -= len(bloque)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"Abre http://localhost:{PUERTO}  (Ctrl+C para detener)")
    http.server.ThreadingHTTPServer(("", PUERTO), Manejador).serve_forever()
