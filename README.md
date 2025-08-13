# Elevator Management API

A real-time elevator management system with SCAN/LOOK scheduling algorithms and WebSocket updates.

## Quick Start

### Prerequisites
- **Node.js** 14+ 
- **MySQL** 5.7+

### Installation

```bash
# Clone and install
git clone https://github.com/its-coded-coder/Elevator-API.git
cd Elevator-API
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Setup database and start server
npm run db:setup
npm start
```

**Server runs on:** `http://localhost:4000`  
**WebSocket:** `ws://localhost:4000/ws`

## Database Setup

### Option 1: Automatic Setup
```bash
npm run db:setup    # Creates database, runs migrations, seeds data
```

### Option 2: Manual Setup
```sql
-- In MySQL
CREATE DATABASE elevator_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
```sql
-- Create a user with password
CREATE USER 'elevator_user'@'localhost' IDENTIFIED BY 'Password';

-- Grant privileges to the user on the new database
GRANT ALL PRIVILEGES ON elevator_management.* TO 'elevator_user'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;
```
```bash
npm run db:migrate  # Run migrations only
```

### Reset Database
```bash
npm run db:reset    # Drops and recreates everything
```

## Default Users

| Username | Password | Role | Permissions |
|----------|----------|------|-------------|
| `admin` | `admin123` | ADMIN | Full access |
| `operator` | `operator123` | OPERATOR | Call elevators, emergency stop |
| `viewer` | `viewer123` | VIEWER | Read-only |

## API Examples

### 1. Login & Get Token
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "admin",
    "password": "admin123"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "username": "admin",
      "role": "ADMIN"
    }
  }
}
```

### 2. Call Elevator
```bash
curl -X POST http://localhost:4000/api/elevators/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "fromFloor": 1,
    "toFloor": 5,
    "priority": 0
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "requestId": "uuid",
    "elevatorId": "uuid",
    "elevatorNumber": 1,
    "estimatedArrival": "2024-01-15T10:30:00.000Z",
    "status": "assigned"
  }
}
```

### 3. Get All Elevator Status
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/elevators/status
```

### 4. Get System Status (Public)
```bash
curl http://localhost:4000/api/system/status
```

### 5. Emergency Stop (Operator+)
```bash
curl -X POST http://localhost:4000/api/elevators/ELEVATOR_ID/emergency-stop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "reason": "Safety concern on floor 5"
  }'
```

### 6. Get Real-time Logs
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:4000/api/logs/elevators?limit=10"
```

## WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:4000/ws');

// Authenticate
ws.send(JSON.stringify({
  type: 'authenticate',
  payload: { token: 'YOUR_TOKEN' }
}));

// Subscribe to elevator updates
ws.send(JSON.stringify({
  type: 'subscribe',
  payload: { room: 'elevators' }
}));
```

## Configuration

Key environment variables in `.env`:

```env
# Database
DB_HOST=localhost
DB_NAME=elevator_management
DB_USER=root
DB_PASSWORD=your_password

# Security
JWT_SECRET=your-super-secure-secret

# Elevator Settings
ELEVATOR_COUNT=5
TOTAL_FLOORS=20
SCHEDULING_ALGORITHM=SCAN    # or LOOK
FLOOR_TRAVEL_TIME=5000       # ms per floor
DOOR_OPERATION_TIME=2000     # ms to open/close
```

## Testing

```bash
npm test                # Run all tests
npm run test:coverage   # Run with coverage
npm run test:watch      # Watch mode
```

## System Overview

- **5 Elevators** (configurable)
- **20 Floors** (configurable) 
- **5-second travel time** per floor
- **2-second door operations**
- **Real-time status tracking**
- **Complete audit trail**

## Health Check

```bash
curl http://localhost:4000/health
```

## Full Documentation

- **API Docs:** `http://localhost:4000/api/docs`
- **Health Check:** `http://localhost:4000/health`
- **System Status:** `http://localhost:4000/api/system/status`

---

**//**

For issues: Check logs in `logs/` directory or review the console output.