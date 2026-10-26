import { todosSchema, updateTodoSchema } from "../types/types.js";
import Todo from "../models/todo.model.js";
import mongoose from "mongoose";
import { success } from "zod";

// Create a new TODO
export const createTodo = async (req, res) => {
  try {
    const parsed = todosSchema.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Validation failed", errors: parsed.error.issues });
    }

    const { title, description } = parsed.data;

    const todos = await Todo.create({
      title,
      description,
      completed: false,
    });

    return res.status(201).json({
      success: true,
      message: "TODO created successfully",
      todo: todos,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

// Fetch all TODOs
export const fetchAllTodo = async (req, res) => {
  try {
    const { completed, search } = req.query;

    // Bonus Challenges - pagination
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "page and limit must be positive integers",
      });
    }

    const skip = (page - 1) * limit;

    // filter
    const filter = {};

    // Bonus Challenges - completed validations
    if (completed !== undefined) {
      if (completed !== "true" && completed !== "false") {
        return res.status(400).json({
          success: false,
          message: "completed must be true or false",
        });
      }

      filter.completed = completed === "true";
    }

    // Bonus Challenges - search validations
    if (search !== undefined) {
      filter.title = {
        $regex: search,
        $options: "i",
      };
    }

    // Bonus Challenges - Sorting: Return the newest TODOs first using createdAt.
    const allTodos = await Todo.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({ success: true, todos: allTodos });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

// Fetch a TODO by ID
export const fetchTodoByID = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: "Invalid TODO ID",
      });
    }

    const todo = await Todo.findById(id);

    if (!todo) {
      return res
        .status(404)
        .json({ success: false, message: "TODO not found" });
    }

    return res.status(200).json({ success: true, todo: todo });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

// Update TODO details
export const updateTodo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: "Invalid TODO ID",
      });
    }

    const parsed = updateTodoSchema.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, errors: parsed.error.issues });
    }

    const { title, description } = parsed.data;

    const updatedTodo = await Todo.findByIdAndUpdate(
      id,
      {
        title,
        description,
      },
      { returnDocument: "after", runValidators: true }, // This returns the updated document and runs Mongoose's schema validators.
    );

    if (!updatedTodo) {
      return res
        .status(404)
        .json({ success: false, message: "TODO not found" });
    }

    return res.status(200).json({
      success: true,
      message: "TODO updated successfully",
      todo: updatedTodo,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

// Toggle TODO completion status
export const toggleTodoStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: "Invalid TODO ID",
      });
    }

    // Find the current TODO
    const currTodo = await Todo.findById(id);

    // Check whether the TODO exists
    if (!currTodo) {
      return res.status(404).json({
        message: "TODO not found",
      });
    }

    // Reverse the current completion status ---------  This line waits until findById() has resolved.
    const toggleTodo = await Todo.findByIdAndUpdate(
      id,
      {
        completed: !currTodo.completed,
      },
      { returnDocument: "after", runValidators: true },
    );

    return res.status(200).json({
      success: true,
      message: "TODO status updated successfully",
      todo: toggleTodo,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

// Delete a TODO
export const deleteTodo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: "Invalid TODO ID",
      });
    }

    const todoTodelete = await Todo.findByIdAndDelete(id);

    if (!todoTodelete) {
      return res.status(404).json({
        success: false,
        message: "TODO not found",
      });
    }

    return res
      .status(200)
      .json({ success: true, message: "TODO deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};
