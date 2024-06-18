import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();

// create transaction
export const createTransaction = async (req: Request, res: Response) => {
  const { title, description, amount, type, category } = req.body;

  const token = req.header("authorization")?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);
  const userId = (decoded as any).id;

  try {
    const transaction = await prisma.transactions.create({
      data: {
        title,
        description,
        amount,
        type,
        categoryId: category,
        userId: userId,
      },
    });

    // Check if a goal exists with the same name as the transaction title
    const goal = await prisma.goal.findFirst({
      where: { name: title, userId: userId },
    });

    console.log("goal: ", goal);

    if (goal) {
      // Create GoalTransaction record
      const goalTransaction = await prisma.goalTransaction.create({
        data: {
          goalId: goal.id,
          transactionId: transaction.id,
        },
      });

      console.log("goalTransaction: ", goalTransaction);
    }

    return res.json({
      success: true,
      message: "Transaction created successfully",
      transaction,
    });
  } catch (error) {
    return res.status(500).json({
      error: `Internal Server Error: ${error}`,
      success: false,
      message: `Transaction creation failed ${error}`,
    });
  } finally {
    await prisma.$disconnect();
  }
};
// update transaction
export const updateTransaction = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, amount, type, category } = req.body;

  const token = req.header("authorization")?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);
  const userId = (decoded as any).id;

  try {
    // Find transaction
    const transaction = await prisma.transactions.findFirst({
      where: { id: id, userId: userId },
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Transaction not found",
        success: false,
      });
    }

    // Update transaction
    const updatedTransaction = await prisma.transactions.update({
      where: { id: id },
      data: {
        title,
        description,
        amount,
        type,
        categoryId: category,
      },
    });

    // Check if a goal exists with the same name as the transaction title
    const goal = await prisma.goal.findFirst({
      where: { name: title, userId: userId },
    });

    if (goal) {
      // Check if a GoalTransaction already exists
      const goalTransaction = await prisma.goalTransaction.findFirst({
        where: {
          goalId: goal.id,
          transactionId: transaction.id,
        },
      });

      if (!goalTransaction) {
        // Create GoalTransaction record if it does not exist
        await prisma.goalTransaction.create({
          data: {
            goalId: goal.id,
            transactionId: transaction.id,
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
      error: "Internal Server Error",
      success: false,
      message: "Transaction update failed",
    });
  } finally {
    await prisma.$disconnect();
  }
};

// delete transaction
export const deleteTransaction = async (req: Request, res: Response) => {
  const { id } = req.params;
  const token = req.header("authorization")?.split(" ")[1];

  // decode token
  const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);

  const userid = (decoded as any).id;
  try {
    // find transaction
    const transaction = await prisma.transactions.findFirst({
      where: { id: id, userId: userid },
    });

    if (!transaction) {
      return res.status(400).json({
        message: "Transaction not found",
        success: false,
      });
    }

    // delete transaction
    await prisma.transactions.delete({
      where: { id: id, userId: userid },
    });

    return res.json({
      succuess: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      success: false,
      message: "Transaction delete failed",
    });
  } finally {
    await prisma.$disconnect();
  }
};

// // get all transactions
// export const getTransactions = async (req: Request, res: Response) => {
//   const token = req.header("authorization")?.split(" ")[1];

//   // decode token
//   const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);

//   const userid = (decoded as any).id;

//   console.log("userid: ", userid);
//   try {
//     const transactions = await prisma.transactions.findMany({
//       where: { userId: userid },
//       include: {
//         category: true,
//       },
//     });

//     // prepare sorted transactions by type like income and expense and their total
//     const incomeTransactions = transactions.filter(
//       (transaction) => transaction.type === "INCOME"
//     );
//     const expenseTransactions = transactions.filter(
//       (transaction) => transaction.type === "EXPENSE"
//     );

//     const totalIncome = incomeTransactions.reduce(
//       (acc, transaction) => acc + transaction.amount,
//       0
//     );

//     const totalExpense = expenseTransactions.reduce(
//       (acc, transaction) => acc + transaction.amount,
//       0
//     );

//     const totalBalance = totalIncome - totalExpense;

//       // make monthly expense,its like start expense of month and end of month expense

//     return res.json({
//       success: true,
//       message: "Transactions fetched successfully",
//       transactions,
//       totalIncome,
//       totalExpense,
//       totalBalance,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       error: "Internal Server Error",
//       success: false,
//       message: "Transaction fetch failed",
//     });
//   } finally {
//     await prisma.$disconnect();
//   }
// };

// get all transactions
export const getTransactions = async (req: Request, res: Response) => {
  const token = req.header("authorization")?.split(" ")[1];

  // decode token
  const decoded = jwt.verify(token as string, process.env.JWT_SECRET as string);

  const userid = (decoded as any).id;

  console.log("userid: ", userid);
  try {
    const transactions = await prisma.transactions.findMany({
      where: { userId: userid },
      include: {
        category: true,
      },
    });

    // get category icons of the categories in the transactions
    const categoryIds = transactions.map(
      (transaction) => transaction.categoryId
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
          in: categories.map((category) => category.iconId),
        },
      },
    });

    const transactionSWithCategoryIcons = transactions.map((transaction) => {
      const category = categories.find(
        (category) => category.id === transaction.categoryId
      );

      const icon = icons.find((icon) => icon.id === category?.iconId);

      return {
        ...transaction,
        category: {
          ...category,
          icon: icon?.icon,
        },
      };
    });

    // prepare sorted transactions by type like income and expense and their total
    const incomeTransactions = transactions.filter(
      (transaction) => transaction.type === "INCOME"
    );
    const expenseTransactions = transactions.filter(
      (transaction) => transaction.type === "EXPENSE"
    );

    const totalIncome = incomeTransactions.reduce(
      (acc, transaction) => acc + transaction.amount,
      0
    );

    const totalExpense = expenseTransactions.reduce(
      (acc, transaction) => acc + transaction.amount,
      0
    );

    const totalBalance = totalIncome - totalExpense;

    // make monthly expense, its like start expense of month and end of month expense
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

    const monthlyExpenses = transactions.filter(
      (transaction) =>
        transaction.type === "EXPENSE" &&
        new Date(transaction.createdAt) >= startOfMonth &&
        new Date(transaction.createdAt) <= endOfMonth
    );

    const totalMonthlyExpense = monthlyExpenses.reduce(
      (acc, transaction) => acc + transaction.amount,
      0
    );

    // Calculate start expense of the month
    const startExpenses = transactions.filter(
      (transaction) =>
        transaction.type === "EXPENSE" &&
        new Date(transaction.createdAt) < startOfMonth
    );

    const startOfMonthExpense = startExpenses.reduce(
      (acc, transaction) => acc + transaction.amount,
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
