import express from "express";
import {
  createTodo,
  deleteTodo,
  fetchAllTodo,
  fetchTodoByID,
  toggleTodoStatus,
  updateTodo,
} from "../controllers/todo.controller.js";

const routes = express.Router();

routes.post("/todos", createTodo);

routes.get("/todos", fetchAllTodo);

routes.get("/todos/:id", fetchTodoByID);

routes.put("/todos/:id", updateTodo);

routes.patch("/todos/:id/toggle", toggleTodoStatus);

routes.delete("/todos/:id", deleteTodo);

export default routes;
