import { z } from "zod";

// POST /todos
export const todosSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters long"),
    description: z.string().optional(),
  })
  .strict();

// PUT /todos/:id
export const updateTodoSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters long"),
    description: z.string(),
  })
  .strict();
