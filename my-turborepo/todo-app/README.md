# TODO REST API

A RESTful API built with **Node.js, Express.js, MongoDB, and Mongoose** to create, retrieve, update, toggle, filter, search, paginate, and delete TODO items.

## Features

- Create a TODO with title and optional description.
- Retrieve all TODOs or fetch a single TODO by ID.
- Update a TODO's title and description.
- Toggle a TODO's completion status.
- Delete a TODO.
- Filter TODOs by completion status.
- Search TODOs by title (case-insensitive).
- Sort TODOs by creation date, newest first.
- Paginate TODO results.
- Validate request data using Zod.
- Handle invalid IDs, missing TODOs, and server errors.

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- Zod
- dotenv

## Prerequisites

Before getting started, make sure you have installed:

- [Node.js](https://nodejs.org/) and npm
- [MongoDB Community Server](https://www.mongodb.com/try/download/community) or a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account
- [Git](https://git-scm.com/)

## Installation

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <YOUR_PROJECT_FOLDER>
```

Replace the placeholders with your GitHub repository URL and project folder name.

### 2. Install dependencies

```bash
npm install
```

Make sure your `package.json` includes the dependencies used by the project, such as `express`, `mongoose`, `dotenv`, and `zod`.

### 3. Configure environment variables

Create a `.env` file in the project root directory:

```env
PORT=6000
MONGODB_URL=mongodb://127.0.0.1:27017/todo_db
```

**For local MongoDB:** Start your MongoDB server before running the application.

**For MongoDB Atlas:**

1. Create a cluster in MongoDB Atlas.
2. Create a database user and password.
3. Allow your IP address in Network Access.
4. Copy your cluster connection string.
5. Replace the local MongoDB URL in `.env` with your Atlas connection string.

Example:

```env
PORT=6000
MONGODB_URL=mongodb+srv://<username>:<password>@<cluster-url>/todo_db
```

Replace the placeholders with your actual Atlas credentials and cluster URL. If your password contains special characters, URL-encode them as required.

**Important:** Never commit your `.env` file or expose your database credentials publicly.

Add the following to `.gitignore`:

```gitignore
node_modules/
.env
```

You can also create a `.env.example` file to document the required variables without exposing credentials:

```env
PORT=6000
MONGODB_URL=your_mongodb_connection_string
```

### 4. Run the server

If your project uses `index.js` as its entry point:

```bash
node index.js
```

Alternatively, add a start script to your `package.json`:

```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  }
}
```

Then run the server in development mode:

```bash
npm run dev
```

You should see messages confirming that MongoDB is connected and the server is running on port `6000`.

Open `http://localhost:6000/` in your browser to check the root route.

## API Endpoints

Base URL: `http://localhost:6000`

| Method   | Endpoint            | Description              |
| -------- | ------------------- | ------------------------ |
| `POST`   | `/todos`            | Create a TODO            |
| `GET`    | `/todos`            | Retrieve TODOs           |
| `GET`    | `/todos/:id`        | Retrieve a TODO by ID    |
| `PUT`    | `/todos/:id`        | Update a TODO            |
| `PATCH`  | `/todos/:id/toggle` | Toggle completion status |
| `DELETE` | `/todos/:id`        | Delete a TODO            |

### Create a TODO

`POST /todos`

Request body:

```json
{
  "title": "Learn MongoDB",
  "description": "Practice CRUD operations"
}
```

### Get TODOs

`GET /todos`

Optional query parameters:

- `completed=true` or `completed=false` — filter by completion status.
- `search=mongo` — search titles without case sensitivity.
- `page=1` — select the page.
- `limit=10` — set the number of results per page.

Example:

```text
GET /todos?completed=false&search=mongo&page=1&limit=10
```

### Get a TODO by ID

`GET /todos/:id`

Example:

```text
GET /todos/REPLACE_WITH_TODO_ID
```

### Update a TODO

`PUT /todos/:id`

Request body:

```json
{
  "title": "Learn MongoDB CRUD",
  "description": "Practice creating, reading, updating, and deleting documents"
}
```

Both `title` and `description` are required for this update operation.

### Toggle completion status

`PATCH /todos/:id/toggle`

No request body is required. Each request switches the TODO's `completed` value between `true` and `false`.

### Delete a TODO

`DELETE /todos/:id`

Replace `:id` with the ID of the TODO you want to delete.

## Validation and Error Handling

- Titles must contain at least three characters after trimming whitespace.
- Descriptions are optional when creating a TODO and required when updating one.
- Completion status defaults to `false`.
- Invalid request data or MongoDB IDs return a `400 Bad Request`.
- A TODO that does not exist returns a `404 Not Found`.
- Unexpected server errors return a `500 Internal Server Error`.

## Testing the API

You can test the endpoints using [Postman](https://www.postman.com/) or another API client.

1. Start MongoDB.
2. Start the Node.js server.
3. Send requests to `http://localhost:6000`.
4. Test creating, retrieving, updating, toggling, filtering, searching, paginating, and deleting TODOs.

## Project Structure

```text
.
├── config/
│   └── db.js
├── controllers/
│   └── todo.controller.js
├── models/
│   └── todo.model.js
├── routes/
│   └── todo.router.js
├── types/
│   └── types.js
├── .env.example
├── .gitignore
├── index.js
├── package.json
└── README.md
```

## License

This project was created for learning and practicing REST API development with Node.js, Express.js, and MongoDB.
