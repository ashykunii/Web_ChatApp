# Web_ChatApp 

Welcome to **Web_ChatApp**, a real-time, responsive, single-page chat application built with a modern clean-architecture .NET stack and vanilla frontend technologies.

## About the Project

Chat App provides a seamless and interactive platform for users to connect and communicate in real time. It supports direct messaging between users and group conversations, with features like presence status, message pinning, replies, editing, and file attachments. 

##  Architectural Overview

This project is built using **Clean Architecture** (also known as Onion Architecture) principles in ASP.NET Core, separating domain models, application use-cases, database infrastructure, and presentation logic into distinct projects:

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
   

## Features

*   **Real-time Messaging:** Utilizes SignalR for instant message delivery.
*   **Direct & Group Chats:** Supports both one-on-one conversations and group discussions.
*   **User Presence:** Displays user online/offline status.
*   **Message Actions:** Includes replying, editing, deleting, and pinning messages.
*   **Attachments:** Allows users to send images and other file types.
*   **User Profiles:** Manage display names, avatars, and presence status.
*   **Admin Panel:** Provides tools for managing users, including banning and unbanning.
*   **Search Functionality:** Easily find contacts and groups.
*   **User Blocking:** Enables users to block unwanted contacts.

## Tech Stack

*   **Frontend:** HTML, CSS, JavaScript (with SignalR)
*   **Backend:** C# (.NET)
*   **Frameworks:** Next.js (though not explicitly used in the provided entry points, it's listed as a framework), TypeScript (also listed, but JS is primary in the entry point)
*   **Database:** SQLite (inferred from `chat.db` files)

## Installation

1.  **Prerequisites:**
    *   .NET SDK (for running the API)
    *   Node.js (for frontend development, although the provided entry points are plain JS/HTML)

2.  **Clone the Repository:**
    ```bash
    git clone https://github.com/ashykunii/Web_ChatApp.git
    cd Web_ChatApp
    ```

3.  **Backend Setup (ChatApp.Api):**
    *   Navigate to the `ChatApp.Api` directory.
    *   Ensure the database file (`chat.db`) and its related WAL and SHM files are present or can be generated upon first run.
    *   Run the application using the .NET CLI:

        ```bash
        dotnet run --project ChatApp.Api
        ```

    * If the application fails to run, try to restore the dependencies first:

    ```bash
    dotnet restore
    ```

    * Then try to run the application again:

    ```bash
    dotnet run --project ChatApp.Api
    ```

4.  **Frontend:**
    *   The frontend is served statically from `ChatApp.Api/wwwroot`.
    *   Ensure you have a web server that can serve static files or run the ASP.NET Core application, which hosts the frontend.

## Usage

1.  **Authentication:**
    *   Upon launching the application, you will be presented with a login/registration screen.
    *   Register a new account or log in with existing credentials. Bellow are some testing accounts to use if you don't have one, unless you create a new account:

**Admin**;
```
{
    "username": "admin",
    "password": "Admin123!"
}
```
**Testing**;
```
{
    "username": "Testing01",
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

## API Reference (Inferred)

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

## Author of this project

Developed and Designed by SOK Sorya.
Lecturer by Mr. Tongsreng, Web Application Development with ASP.NET Core.

## License

This project is for educational and personal use only, and was developed as a final project.

## Footer

**Web_ChatApp**

*   [Repository](https://github.com/ashykunii/Web_ChatApp)
*   **Author:** ashykunii




