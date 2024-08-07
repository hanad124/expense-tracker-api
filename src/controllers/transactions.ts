import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { ImageUpload } from "../utils/upload";
import getUserId from "../helpers/getUserId";

const prisma = new PrismaClient();

export const createTransaction = async (req: Request, res: Response) => {
  const {
    title,
    description,
    amount,
    type,
    category,
    number,
    receipt,
    budgetId,
    goalId,
  } = req.body;

  const userId = getUserId(req);

  try {
    // Start image upload in the background
    const uploadPromise = receipt ? ImageUpload(receipt) : Promise.resolve("");

    // Create transaction
    const transaction = await prisma.transactions.create({
      data: {
        title,
        description,
        amount,
        number,
        type,
        receipt: receipt ? await uploadPromise : undefined,
        categoryId: category,
        userId: userId,
        budgetId: budgetId,
      },
    });

    const budget = await prisma.budget.findFirst({
      where: {
        userId: userId,
        id: budgetId,
      },
    });

    console.log("budgetId", budgetId);

    if (budget && budgetId !== undefined) {
      let updatedLeftToSpend = budget.leftToSpend;

      if (type === "EXPENSE") {
        if (amount > updatedLeftToSpend) {
          console.log("expense amount::", amount);
          return;
          // return res.status(400).json({
          //   success: false,
          //   message: "Expense amount exceeds the available budget.",
          // });
        }
        updatedLeftToSpend -= amount;
      }

      const isBudgetCompleted = updatedLeftToSpend <= 0;

      await prisma.budget.update({
        where: {
          id: budgetId,
        },
        data: {
          leftToSpend: updatedLeftToSpend,
          isCompleted: isBudgetCompleted,
        },
      });
    }

    if (type === "INCOME" && goalId !== undefined) {
      // Get the specific goal for the user
      const goal = await prisma.goal.findFirst({
        where: {
          id: goalId,
          userId: userId,
          achieved: false,
        },
      });

      if (goal) {
        const remainingAmount = goal.amount - goal.savedAmount;
        const amountToAdd = Math.min(amount, remainingAmount);
        const newSavedAmount = goal.savedAmount + amountToAdd;
        const isAchieved = newSavedAmount >= goal.amount;

        await prisma.goal.update({
          where: { id: goal.id },
          data: {
            savedAmount: newSavedAmount,
            achieved: isAchieved,
            achievedDate: isAchieved ? new Date() : null,
          },
        });
      }
    }

    return res.json({
      success: true,
      message: "Transaction created successfully",
      transaction,
    });
  } catch (error) {
    return res.status(500).json({
      error: `Internal Server Error: ${error.message}`,
      success: false,
      message: `Transaction creation failed: ${error.message}`,
    });
  } finally {
    await prisma.$disconnect();
  }
};

export const updateTransaction = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, amount, type, category, number } = req.body;

  const userId = getUserId(req);

  try {
    // Find transaction
    const transaction = await prisma.transactions.findFirst({
      where: { id, userId },
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Transaction not found",
        success: false,
      });
    }

    // Update transaction
    const updatedTransaction = await prisma.transactions.update({
      where: { id },
      data: {
        title,
        description,
        amount,
        type,
        number,
        categoryId: category,
      },
    });

    // Offload goal updates to a background job if the transaction is an INCOME type
    if (type === "INCOME") {
      // Get all ongoing goals for the user
      const goals = await prisma.goal.findMany({
        where: {
          userId: userId,
          achieved: false,
        },
      });

      // Update each goal's savedAmount and check if it has reached its targetAmount
      for (const goal of goals) {
        const remainingAmount = goal.amount - goal.savedAmount;
        const amountToAdd = Math.min(amount, remainingAmount);
        const newSavedAmount = goal.savedAmount + amountToAdd;
        const isAchieved = newSavedAmount >= goal.amount;

        await prisma.goal.update({
          where: { id: goal.id },
          data: {
            savedAmount: newSavedAmount,
            achieved: isAchieved,
            achievedDate: isAchieved ? new Date() : null,
          },
        });
      }
    }

    return res.json({
      success: true,
      message: "Transaction updated successfully",
      transaction: updatedTransaction,
    });
  } catch (error) {
    return res.status(500).json({
      error: `Internal Server Error: ${error.message}`,
      success: false,
      message: `Transaction update failed: ${error.message}`,
    });
  } finally {
    await prisma.$disconnect();
  }
};

// delete transaction
export const deleteTransaction = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = getUserId(req);

  try {
    // Delete transaction in a single operation
    const transaction = await prisma.transactions.deleteMany({
      where: {
        id: id,
        userId: userId,
      },
    });

    if (transaction.count === 0) {
      return res.status(404).json({
        message: "Transaction not found",
        success: false,
      });
    }

    return res.json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: `Internal Server Error: ${error.message}`,
      success: false,
      message: `Transaction delete failed: ${error.message}`,
    });
  } finally {
    await prisma.$disconnect();
  }
};

// get all transactions
export const getTransactions = async (req: Request, res: Response) => {
  const token = req.header("authorization")?.split(" ")[1];

  // decode token
  const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);

  const userid = (decoded as any).id;

  try {
    const transactions = await prisma.transactions.findMany({
      where: { userId: userid },
      include: {
        category: true,
      },
    });

    // console.log("transactions: ", transactions);

    // get category icons of the categories in the transactions
    const categoryIds = transactions.map(
      (transaction: any) => transaction.categoryId
    );

    const categories = await prisma.category.findMany({
      where: {
        id: {
          in: categoryIds,
        },
      },
    });

    const icons = await prisma.icon.findMany({
      where: {
        id: {
          in: categories.map((category: any) => category.iconId),
        },
      },
    });

    const transactionSWithCategoryIcons = transactions.map(
      (transaction: any) => {
        const category = categories.find(
          (category: any) => category.id === transaction.categoryId
        );

        const icon = icons.find((icon: any) => icon.id === category?.iconId);

        return {
          ...transaction,
          category: {
            ...category,
            icon: icon?.icon,
          },
        };
      }
    );

    // prepare sorted transactions by type like income and expense and their total
    const incomeTransactions = transactions.filter(
      (transaction: any) => transaction.type === "INCOME"
    );
    const expenseTransactions = transactions.filter(
      (transaction: any) => transaction.type === "EXPENSE"
    );

    const totalIncome = incomeTransactions.reduce(
      (acc: any, transaction: any) => acc + transaction.amount,
      0
    );

    const totalExpense = expenseTransactions.reduce(
      (acc: any, transaction: any) => acc + transaction.amount,
      0
    );

    const totalBalance = totalIncome - totalExpense;

    // make monthly expense, its like start expense of month and end of month expense
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

    const monthlyExpenses = transactions.filter(
      (transaction: any) =>
        transaction.type === "EXPENSE" &&
        new Date(transaction.createdAt) >= startOfMonth &&
        new Date(transaction.createdAt) <= endOfMonth
    );

    const totalMonthlyExpense = monthlyExpenses.reduce(
      (acc: any, transaction: any) => acc + transaction.amount,
      0
    );

    // Calculate start expense of the month
    const startExpenses = transactions.filter(
      (transaction: any) =>
        transaction.type === "EXPENSE" &&
        new Date(transaction.createdAt) < startOfMonth
    );

    const startOfMonthExpense = startExpenses.reduce(
      (acc: any, transaction: any) => acc + transaction.amount,
      0
    );

    // total expenses per week
    const currentDate = new Date();
    const currentDay = currentDate.getDay();
    const currentWeek = currentDate.getDate() - currentDay;

    const startOfWeek = new Date(currentDate.setDate(currentWeek));

    const weeklyExpenses = transactions.filter(
      (transaction: any) =>
        transaction.type === "EXPENSE" &&
        new Date(transaction.createdAt) >= startOfWeek
    );

    const totalWeeklyExpense = weeklyExpenses.reduce(
      (acc: any, transaction: any) => acc + transaction.amount,
      0
    );

    return res.json({
      success: true,
      message: "Transactions fetched successfully",
      transactions: transactionSWithCategoryIcons,
      totalIncome,
      totalExpense,
      totalBalance,
      totalMonthlyExpense,
      startOfMonthExpense,
      totalWeeklyExpense,
    });
  } catch (error) {
    console.log("tansaction error: ", error);
    return res.status(500).json({
      error: "Internal Server Error",
      success: false,
      message: "Transaction fetch failed",
    });
  } finally {
    await prisma.$disconnect();
  }
};

// get transaction by id
export const getTransaction = async (req: Request, res: Response) => {
  const { id } = req.params;
  const token = req.header("authorization")?.split(" ")[1];

  // decode token
  const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);

  const userid = (decoded as any).id;
  try {
    const transaction = await prisma.transactions.findFirst({
      where: { id: id, userId: userid },
      include: {
        category: true,
      },
    });

    if (!transaction) {
      return res.status(400).json({
        message: "Transaction not found",
        success: false,
      });
    }

    return res.json({
      success: true,
      message: "Transaction fetched successfully",
      transaction,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      success: false,
      message: "Transaction fetch failed",
    });
  } finally {
    await prisma.$disconnect();
  }
};

// get transactions by category
export const getTransactionsByCategory = async (
  req: Request,
  res: Response
) => {
  const { category } = req.body;

  const token = req.header("authorization")?.split(" ")[1];

  // decode token
  const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);

  const userid = (decoded as any).id;

  try {
    const transactions = await prisma.transactions.findMany({
      where: { categoryId: category, userId: userid },
      include: {
        category: true,
      },
    });

    return res.json({
      success: true,
      message: "Transactions fetched successfully",
      transactions,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      success: false,
      message: "Transaction fetch failed",
    });
  } finally {
    await prisma.$disconnect();
  }
};
