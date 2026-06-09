# ⚡ DocEngine-X

> Servicio de generación de documentos PDF en segundo plano, con historial público en tiempo real.  
> Universidad Galileo · Ing. Alejandro Córdova · 2026

---

## 📦 Stack de Tecnologías

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Framework API | Express | 4.19 |
| WebSockets | Socket.io | 4.7 |
| Cola de tareas | BullMQ | 5.12 |
| Broker de mensajes | Redis (Alpine) | latest |
| Base de datos | PostgreSQL | 15 Alpine |
| ORM/Driver | node-postgres (pg) | 8.12 |
| Plantillas | Handlebars | 4.7 |
| Renderizado PDF | Puppeteer + Chromium | 22.12 |
| Almacenamiento | AWS S3 (SDK v3) | 3.600 |
| Servidor frontend | nginx | Alpine |
| Contenedores | Docker + Compose | v3.9 |

---

## 🏗️ Arquitectura

```
┌──────────────┐     HTTP/WS      ┌─────────────────┐
│   Frontend   │ ←──────────────→ │  nginx (proxy)  │
│  (nginx:80)  │                  └────────┬────────┘
└──────────────┘                           │ /api/ + /socket.io/
                                           ▼
                                  ┌─────────────────┐
                                  │  Express API    │  :3000
                                  │  + Socket.io    │
                                  └──┬──────────┬───┘
                                     │          │
                              ┌──────▼───┐  ┌──▼──────────┐
                              │ BullMQ   │  │ PostgreSQL   │
                              │  Queue   │  │  (docs DB)   │
                              └──────┬───┘  └─────────────┘
                                     │ Redis
                              ┌──────▼──────┐
                              │   Worker    │  (proceso separado)
                              │ Handlebars  │
                              │ + Puppeteer │
                              └──────┬──────┘
                                     │ PDF Buffer
                              ┌──────▼──────┐
                              │   AWS S3    │
                              │  (storage)  │
                              └─────────────┘
```

**Flujo de una solicitud:**
1. Cliente envía `POST /api/documents` con JSON payload
2. API inserta registro con `status: queued` en PostgreSQL y encola job en Redis
3. Socket.io emite `doc:status` → Dashboard actualiza badge en tiempo real
4. **Worker** toma el job → renderiza HTML con Handlebars → genera PDF con Puppeteer
5. Worker sube PDF a S3 → notifica API vía `PATCH /api/documents/:id/status`
6. API actualiza DB y emite socket `doc:status: completed` con URL del archivo

---

## 🚀 Pasos para levantar el proyecto

### Prerrequisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- [Git](https://git-scm.com/) instalado
- Credenciales de AWS S3 (bucket con acceso público habilitado)

### 1. Clonar el repositorio

```bash
git clone https://github.com/byron23-creator/DocEngineX-24011342.git
cd DocEngineX-24011342
```

### 2. Configurar variables de entorno

Copiar el archivo de ejemplo y rellenar con tus credenciales reales:

```bash
cp backend/.env.example backend/.env
```

Editar `backend/.env`:

```env
PORT=3000
NODE_ENV=development

REDIS_URL=redis://redis:6379
DATABASE_URL=postgres://docengine:docengine_pass@postgres:5432/docengine_db

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_BUCKET=nombre-de-tu-bucket
```

> **Nota:** Para el entorno Docker Compose, las variables AWS también deben estar disponibles en el shell que ejecuta el comando, o puedes crear un archivo `.env` en la raíz del proyecto (al lado de `docker-compose.yml`).

Crear `.env` en la raíz del proyecto:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_BUCKET=nombre-de-tu-bucket
```

### 3. Levantar todos los servicios

```bash
docker compose up --build
```

Docker levantará en orden (con healthchecks):
1. `redis` → espera PONG
2. `postgres` → espera `pg_isready`
3. `backend` → espera `/health` HTTP 200
4. `worker` → arranca procesador de cola
5. `frontend` → nginx sirviendo la UI

### 4. Acceder a la aplicación

| Servicio | URL |
|----------|-----|
| **Panel de Control** | http://localhost:8080 |
| **API REST** | http://localhost:3000/api/documents |
| **Health check** | http://localhost:3000/health |

### 5. Detener los servicios

```bash
docker compose down
# Para también eliminar la base de datos:
docker compose down -v
```

---

## 🎛️ Panel de Control — Guía de uso

### Generar un documento

1. Seleccionar **tipo de plantilla**: Factura, Reporte o Certificado
2. Hacer clic en **"Cargar ejemplo"** para ver un payload de muestra, o escribir tu propio JSON
3. Hacer clic en **"Generar PDF"**
4. El documento aparece inmediatamente en el historial con estado `queued`
5. Observar cómo el badge cambia en tiempo real: `queued → processing → completed`
6. Al completarse, aparece el botón **"⬇ Descargar"** con el enlace directo al PDF en S3

### Filtros de Auditoría

Usar el selector **"Filtrar por estado"** en el historial:

| Filtro | Uso |
|--------|-----|
| Todos los estados | Vista completa del historial |
| `queued` | Jobs esperando ser procesados |
| `processing` | Jobs en proceso activo |
| `completed` | Documentos generados exitosamente |
| **`failed`** | **Diagnóstico de errores — ver razón del fallo** |

Al seleccionar `failed`, se habilita el botón **"⚠ Ver error"** que muestra el mensaje exacto del error del worker.

---

## 📄 Tipos de plantillas

### `invoice` — Factura
Factura profesional con tabla de ítems, subtotal, IVA y total. Soporta datos del emisor y receptor.

### `report` — Reporte
Reporte ejecutivo con portada, KPIs tipo grid, secciones narrativas y tabla de datos con badges de estado.

### `certificate` — Certificado
Certificado formal con marco dorado, firma de múltiples signatarios y sello institucional.

---

## 🔌 API Reference

### `POST /api/documents`
Encola la generación de un nuevo documento.

```json
{
  "template_type": "invoice",
  "payload": { ... }
}
```

**Respuesta 202:**
```json
{
  "id": "uuid",
  "status": "queued",
  "template_type": "invoice",
  "created_at": "2026-08-06T21:00:00Z"
}
```

### `GET /api/documents`
Lista todos los documentos. Soporta filtro `?status=failed`.

### `GET /api/documents/:id`
Obtiene un documento por UUID.

### `PATCH /api/documents/:id/status`
*(Uso interno del worker)* Actualiza estado y emite evento Socket.io.

### WebSocket — evento `doc:status`
```json
{
  "id": "uuid",
  "status": "completed",
  "file_url": "https://bucket.s3.region.amazonaws.com/documents/invoice/uuid.pdf",
  "template_type": "invoice"
}
```

---

## 🗄️ Esquema de Base de Datos

```sql
CREATE TABLE public_documents (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  status        doc_status    NOT NULL DEFAULT 'queued',  -- queued|processing|completed|failed
  template_type doc_template  NOT NULL,                   -- invoice|report|certificate
  file_url      VARCHAR(2048),                            -- URL pública en S3
  error_reason  TEXT,                                     -- Mensaje de error del worker
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

---

## 👤 Autor

**Carné:** 24011342  
**Curso:** Seguridad y Arquitectura de Software  
**Universidad Galileo** — 2026
