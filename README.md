# Web_ChatApp 

Welcome to **`Web_ChatApp`**, a real-time, responsive, single-page chat application built with a modern clean-architecture .NET stack and vanilla frontend technologies.

## Table of Contents

- [About the Project](#about-the-project)
- [Architectural Overview](#architectural-overview)
- [Key Features](#key-features)
- [Tech Stacks](#tech-stacks)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [API References](#api-references)
- [Academic Credits](#academic-credits)


## About the Project

**`Web_ChatApp`** provides a seamless and interactive platform for users to connect and communicate in real time. It supports direct messaging between users and group conversations, with features like presence status, message pinning, replies, editing, and file attachments. 

##  Architectural Overview

This project is built using **Clean Architecture** (also known as **`Onion Architecture`**) principles in ASP.NET Core, separating domain models, application use-cases, database infrastructure, and presentation logic into distinct projects:

```
    ┌────────────────────────────────────────┐
    │              ChatApp.Api               │ (Presentation & WebSocket Hubs)
    └───────────────────┬────────────────────┘
                        │
                        ▼
    ┌────────────────────────────────────────┐
    │          ChatApp.Application           │ (Business Logic & Use Cases)
    └───────────────────┬────────────────────┘
                        │
                        ▼
    ┌────────────────────────────────────────┐
    │          ChatApp.Infrastructure        │ (Data Context & Repositories)
    └───────────────────┬────────────────────┘
                        │
                        ▼
    ┌────────────────────────────────────────┐
    │             ChatApp.Domain             │ (Core Entities & Interfaces)                  
    └────────────────────────────────────────┘
```

This project used these technologies: 
1. **`ChatApp.Domain`**: 
   - The innermost core layer.
   - Contains pure entity models (`User`, `Contact`, `Message`, `Group`, `GroupMember`), custom enums (`PresenceStatus`, `Role`), and repository interfaces.
   - Free from external framework dependencies.
2. **`ChatApp.Application`**: 
   - Defines the orchestrating business logic and core interfaces.
   - Contains DTOs (Data Transfer Objects), service implementations, validation schemas, and interfaces for operations like cryptography and JWT token generators.
3. **`ChatApp.Infrastructure`**: 
   - Deals with peripheral concerns such as persistence, databases, migrations, and identity repositories.
   - Houses the EF Core database context (`ChatAppContext`), migrations, and SQLite DB configuration settings.
4. **`ChatApp.Api`**: 
   - The presentation and entry-point layer.
   - Hosts ASP.NET Core Controllers, SignalR Hubs (`ChatHub.cs`), custom Middlewares (like `BanEnforcementMiddleware`), swagger UI documentation, and serves the static files (HTML, CSS, JS) from the `wwwroot` directory.
5. **`SignalR`**: 
   - Provides real-time communication between clients and the server.
   - Used for instant message delivery, user presence updates, typing indicators, and other real-time features.
6. **`Swagger`**: 
   - Provides API documentation and a user interface for testing the API endpoints.
   - Used to explore and interact with the available API endpoints during development.
7. **`Jwt`**: 
   - Provides authentication and authorization between clients and the server.
   

## Key Features

* **Real-time Synchronization**: Instant message dispatch, delivery tracking, edits, deletes, and online presence indicators via SignalR.
* **Direct Messaging (DM)**: Safe, private 1-on-1 chats between authenticated contacts.
* **Group Conversations**: Dynamic chat rooms with multi-user participants, customizable roles, and member management controls.
* **Smart Presence Status**: Automatic switching between `Online`, `Away`, `DoNotDisturb`, and `Offline` modes.
* **Message Interactions**: Message quoting (replies), real-time edits, global deletes, and dynamic chat pins.
* **Media & File Uploads**: Built-in uploading system for sharing images (with auto-preview) and arbitrary documents (with download links).
* **Double-Accent Theme Engine**: Fluent night/dark and light styling modes prioritizing soothing forest green and modern navy palettes.
* **Administrative Suite**: Special sidebar panel to manage users, ban violators, and enforce terms of service globally in real-time.
* **Security & Audits**: JWT bearer token authorization, password hashing, and custom middleware checking account ban statuses on every API call.

## Tech Stacks

Here is a detailed breakdown of the core technologies utilized in this application and their respective roles:

### Backend Services
* **ASP.NET Core Web API (.NET 8.0)**
  * *Role*: Serves as the robust, cross-platform backend hosting RESTful API endpoints for user account authentication, profile adjustments, contacts loading, and group management.

* **ASP.NET Core SignalR (v8.0.7)**
  * *Role*: Handles real-time bi-directional messaging communications between the server and all connected clients.

* **Entity Framework Core 8.0**
  * *Role*: The Object-Relational Mapper (ORM) representing the data access layer.

* **SQLite Database**
  * *Role*: Relational database system stored locally in `ChatApp.Api/chat.db`.
* **JWT Bearer Token Authentication**
  * *Role*: Secures REST API calls and WebSocket connections.

### Frontend Application
* **HTML5 & Vanilla CSS3**
  * *Role*: App layout structure, layout styling, and design system themes.
* **Vanilla JavaScript (ES6+)**
  * *Role*: State management, event handlers, SignalR client connections, fetch API utilities, and dynamic page DOM rendering.

### API Documentation & Development
* **OpenAPI / Swagger UI**
  * *Role*: Interactive API sandbox playground.

---

## Installation

### Prerequisites
* **.NET 10.0 SDK** (Builds the API application service)
* A modern browser (Chrome, Edge, Firefox, Safari)

### Step-by-Step Setup
1. **Clone the project repository**:
   ```bash
   git clone https://github.com/ashykunii/Web_ChatApp.git
   cd Web_ChatApp
   ```
2. **Restore NuGet dependencies**:
   ```bash
   dotnet restore
   ```
3. **Run database migrations**:
   The application uses EF Core migrations. Apply them to generate the SQLite database:
   ```bash
   dotnet ef database update --project ChatApp.Infrastructure --startup-project ChatApp.Api
   ```
   *(Note: The repository already contains a seeded `chat.db` for quick-start testing)*.

4. **Launch the Application**:
   ```bash
   dotnet run --project ChatApp.Api
   ```

5. **Access the Application**:
    > Open a browser window and navigate to `http://localhost:5163` to view the chat interface. You can access the API Swagger workspace directly at `http://localhost:5163/swagger`.



## Extra commands for terminal (Windows PowerShell)
These are some extra commands that can be used in the terminal (Windows PowerShell):
```bash
# Purge and clean solution assemblies
dotnet clean
# Terminate running background engine operations forcefully
Stop-Process -Name dotnet -Force -ErrorAction SilentlyContinue      
# Terminate localized web host processes cleanly
Stop-Process -Name Web_ChatApp* -Force -ErrorAction SilentlyContinue
# Trigger solution build compilation verify pass
dotnet build

```

## Usage

1.  **Authentication:**
    *   Upon launching the application, you will be presented with a login/registration screen.
    *   Register a new account or log in with existing credentials. Bellow are some testing accounts to use if you don't have one, unless you create a new account:

**Testing01 Account**;
```json
{
    "username": "Testing01",
    "password": "password123"
}
```

**Testing02 Account**;
```json
{
    "username": "Testing02",
    "password": "password123"
}
```

2.  **Navigating the App:**
    *   **Sidebar:** Displays contacts and groups. You can switch between "Chats", "Contacts", and "Groups" views.
    *   **Search:** Use the search bar at the top of the sidebar to find users.
    *   **Chatting:** Click on a contact or group to open the chat pane.
    *   **Drawer Menu:** Click the hamburger icon to access user profile, create new groups, view settings, and log out.

3.  **Chat Features:**
    *   **Sending Messages:** Type your message in the text area and press Enter or click the send button.
    *   **Attachments:** Click the plus icon (implied by the UI structure) to upload files or images.
    *   **Replying:** Right-click a message and select "Reply" to quote a message in your response.
    *   **Editing:** Right-click a message you sent and select "Edit Message" to modify its content.
    *   **Pinning:** Right-click a message and select "Pin Message" to pin it for the current chat.
    *   **User Presence:** The status of contacts (Online, Away, etc.) is displayed next to their names.
    *   **Admin Panel:** If you have admin privileges, you can access the Admin panel from the sidebar to manage users.

## Project Structure

```
Web_ChatApp/
├── ChatApp.Api/
│   ├── Controllers/
│   │   ├── AdminController.cs
│   │   ├── AuthController.cs
│   │   ├── ContactsController.cs
│   │   ├── GroupsController.cs
│   │   └── MessagesController.cs
│   ├── Hubs/
│   │   ├── ChatHub.cs
│   │   └── NameUserIdProvider.cs
│   ├── Middleware/
│   │   └── BanEmforcementMiddleware.cs
│   ├── Properties/
│   │   └── launchSettings.json
│   ├── wwwroot/
│   │   ├── app.js
│   │   ├── index.html
│   │   └── style.css
│   ├── appsettings.Development.json
│   ├── appsettings.json
│   ├── chat.db
│   ├── chat.db-shm
│   ├── chat.db-wal
│   ├── ChatApp.Api.csproj
│   └── ChatApp.Api.http
├── ChatApp.Application/
│   ├── DTOs/
│   ├── Interfaces/
│   └── Services/
│   ├── ChatApp.Application.csproj
├── ChatApp.Domain/
│   ├── Enums/
│   ├── Interfaces/
│   └── Models/
│   ├── ChatApp.Domain.csproj
├── ChatApp.Infrastructure/
│   ├── Data/
│   ├── Migrations/
│   ├── Repositories/
│   ├── DependencyInjection.cs
│   ├── ChatApp.Infrastructure.csproj
├── ChatApp.slnx
└── README.md
```

## API References

Based on the `app.js` and controller files, the following API endpoints are likely available:

*   **Authentication:**
    *   `POST /api/auth/register`
    *   `POST /api/auth/login`
    *   `GET /api/auth/me`
    *   `PUT /api/auth/profile`
*   **Contacts:**
    *   `GET /api/contacts`
    *   `POST /api/contacts/{userId}`
    *   `GET /api/contacts/search?q={query}`
    *   `POST /api/contacts/block/{userId}`
    *   `DELETE /api/contacts/block/{userId}`
*   **Groups:**
    *   `GET /api/groups`
    *   `GET /api/groups/{groupId}`
    *   `POST /api/groups`
    *   `POST /api/groups/{groupId}/members`
    *   `DELETE /api/groups/{groupId}/members/{userId}`
*   **Messages:**
    *   `POST /api/messages/upload`
    *   `GET /api/messages/private/{userId}?cursor={cursor}`
    *   `GET /api/messages/group/{groupId}?cursor={cursor}`
*   **Admin:**
    *   `GET /api/admin/users`
    *   `POST /api/admin/ban/{userId}`
    *   `POST /api/admin/unban/{userId}`


## Academic Credits

* **Project Name:** Web_ChatApp
* **Repository Source:** [GitHub Repository Link](https://github.com/ashykunii/Web_ChatApp)
* **Author / Developer / Designer:** SOK Sorya
* **Course Assignment:** Final Project Evaluation
* **Course Title:** Web Application Development with ASP.NET Core
* **Supervising Lecturer:** Mr. Tongsreng
* **License:** This application and its underlying source structure are developed and licensed exclusively for **educational and personal use only**.

>Read our deep-dive architectural decisions in the [Tech Stack Documentation](./TECH-STACK.md).

<br><br>
<center>©2026 SOK Sorya, All Rights Reserved.</center>