# Project Architecture & Folder Structure Documentation

This document provides an industry-standard overview of the application's file and folder architecture. The project follows a **Feature-Based Modular MVC (Model-View-Controller)** pattern. This ensures that the codebase remains scalable, highly cohesive, and easy for new developers to understand as the project grows.

---

## 1. Root Directory Structure

The root level is reserved for project configuration and dependency management.

- **`.env` / `.env.example`**: Environment variable files. They store sensitive data like database credentials, API keys, and environment-specific settings (development vs. production).
- **`package.json` & `package-lock.json`**: Manages project dependencies, metadata, and custom terminal scripts (e.g., `npm start`, `npm run dev`).
- **`src/`**: The core source code directory. All application logic and configurations live here.

---

## 2. Core Application Layer (`/src`)

These files bootstrap and configure the underlying server.

- **`server.js`**: The main entry point. Its strict responsibility is to instantiate the HTTP server, establish core infrastructure connections (like connecting to the database), and start listening on a specified port.
- **`app.js`**: The Express application configuration file. It attaches all global middlewares (CORS, body parsers, security headers), integrates API documentation, and mounts the base router.
- **`swagger.js`**: Handles the setup and integration of Swagger for generating interactive API documentation.

---

## 3. Infrastructure & Shared Layers (`/src/`)

These directories contain code that is shared globally across the entire application.

### `/config`
Responsible for loading and validating configurations.
- e.g., **`db.js`**: Handles the database connection logic.
- e.g., **`env.js`**: Validates and exports environment variables so the app throws an error immediately if a required configuration is missing.

### `/middleware`
Interceptors that run between the incoming request and the core business logic.
- **Error Middlewares**: Catches exceptions thrown anywhere in the app, preventing crashes and formatting them into standard, predictable JSON error responses for the client.
- **Auth Middlewares**: Validates user sessions (e.g., verifying JWT tokens) to protect secure routes.

### `/utils` (or `/helpers`)
Reusable utility functions that don't belong to any specific feature.
- **Response Formatters**: Functions to ensure every API response (success or failure) follows the exact same JSON structure.

### `/routes`
The central routing hub of the application.
- **`index.js`**: Aggregates all the individual feature routers and mounts them under a base path (e.g., `/api/v1`). It also provides global health-check endpoints for deployment pipelines and load balancers to monitor server uptime.

---

## 4. Feature Modules Layer (`/src/modules/`)

This is where the actual business logic resides. Instead of grouping all controllers or all models together globally, the app groups files by their **Domain/Feature** (e.g., `users`, `products`, `orders`). 

Inside any given feature folder, the files are strictly divided by their architectural responsibility:

### 1. `*.routes.js` (The Gateway)
- **Responsibility**: Maps incoming HTTP methods (GET, POST, PUT, DELETE) and URL endpoints to their corresponding Controller functions.
- **Usage**: It acts as the traffic cop for the module. It is also where route-level middlewares (like request body validation or authentication checks) are applied before hitting the controller.

### 2. `*.controller.js` (The Presentation Layer)
- **Responsibility**: Handles the HTTP request and response cycle.
- **Usage**: Extracts data from the incoming request (`req.body`, `req.params`, `req.query`), passes that data to the Service layer, and then sends the HTTP response (`res.json`) back to the client. 
- **Rule**: Controllers should contain **zero business logic**.

### 3. `*.service.js` (The Business Logic Layer)
- **Responsibility**: The "brain" of the module.
- **Usage**: Executes business rules, performs calculations, and coordinates with the Models to retrieve or update data. 
- **Rule**: Services are strictly decoupled from the HTTP layer. They do not know about Express `req` or `res` objects. This makes them highly reusable and easy to unit test.

### 4. `*.model.js` (The Data Access Layer)
- **Responsibility**: Interacts directly with the database.
- **Usage**: Defines the database schema, data types, and relationships (using an ORM like Sequelize or Mongoose). 

---

## 5. Request Lifecycle (How It Works)

When a client makes an API request, it follows this predictable flow:

1. **Entry**: Request hits `server.js` and is passed to `app.js`.
2. **Global Prep**: Global middlewares in `app.js` parse the request (JSON) and secure it.
3. **Central Router**: The request arrives at `src/routes/index.js`, which forwards it to the correct Feature Module.
4. **Module Router**: `*.routes.js` intercepts the request, runs any specific validations, and routes it to the correct Controller.
5. **Controller to Service**: `*.controller.js` extracts the payload and calls a function in `*.service.js`.
6. **Service to DB**: `*.service.js` processes the business rules and uses `*.model.js` to read/write data to the database.
7. **Response**: The Service returns the processed data to the Controller, which uses a Utility formatter to send a clean JSON response back to the client.
