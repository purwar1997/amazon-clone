import bcrypt from 'bcryptjs';
import User from '../models/user';
import Category from '../models/category';
import asyncHandler from '../services/asyncHandler';
import CustomError from '../utils/customError';
import cookieOptions from '../utils/cookieOptions';
import mailSender from '../utils/mailSender';

/** Controllers for User model */

/**
 * @SIGNUP
 * @request_type POST
 * @route http://localhost:4000/api/auth/signup
 * @decription Controller that allows user to create an account
 * @parameters name, email, password, confirmPassword
 * @returns User object
 */

export const signup = asyncHandler(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  if (!(name && email && password && confirmPassword)) {
    throw new CustomError('Please enter all the details', 401);
  }

  if (password !== confirmPassword) {
    throw new CustomError("Confirmed password doesn't match with password", 401);
  }

  const user = await User.findOne({ email });

  if (user) {
    throw new CustomError('User already exists', 401);
  }

  let newUser = new User();
  newUser = await newUser.save();
  newUser.password = undefined;

  res.status(201).json({
    success: true,
    message: 'A new user has been created',
    user: newUser,
  });
});

/**
 * @LOGIN
 * @request_type POST
 * @route http://localhost:4000/api/auth/login
 * @description Controller that allows user to login
 * @parameters email, password
 * @returns response object
 */

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new CustomError('Please enter all the details', 401);
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new CustomError('Email not registered', 401);
  }

  const passwordMatched = await user.comparePassword(password);

  if (!passwordMatched) {
    throw new CustomError('Invalid password', 401);
  }

  const token = user.generateJWTtoken();
  res.status(201).cookie('token', token, cookieOptions);

  res.status(201).json({
    success: true,
    message: 'User has successfully logged in',
  });
});

/**
 * @LOGOUT
 * @request_type GET
 * @route http://localhost:4000/api/auth/logout
 * @description Controller that allows user to logout
 * @parameters none
 * @returns response object
 */

export const logout = asyncHandler(async (_req, res) => {
  res.status(201).clearCookie('token', cookieOptions);

  res.status(201).json({
    success: true,
    message: 'User has successfully logged out',
  });
});

/**
 * @FORGOT_PASSWORD
 * @request_type PUT
 * @route http://localhost:4000/api/auth/password/forgot
 * @description Controller that sends a reset password email to the user
 * @parameters email
 * @returns reset password email to the user
 */

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new CustomError('Email is required', 401);
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new CustomError('Email not registered', 401);
  }

  const resetPasswordToken = user.generateForgotPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetPasswordURL = `${req.protocol}://${req.hostname}/api/auth/password/reset/${resetPasswordToken}`;

  try {
    await mailSender({
      email: user.email,
      subject: 'Password reset email',
      text: `Click on this link to reset your password: ${resetPasswordURL}`,
    });

    res.status(201).json({
      success: true,
      message: `Password reset email is successfully sent to ${user.email}`,
    });
  } catch (err) {
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;
    await user.save({ validateBeforeSave: false });

    throw new CustomError(err.message || 'Failed to send password reset email', 500);
  }
});

/**
 * @PASSWORD_RESET
 * @request_type PUT
 * @route http://localhost:4000/api/auth/password/reset/:resetPasswordToken
 * @description Controller that allows user to reset his password
 * @parameters password, confirmPassword, resetPasswordToken
 * @returns Response object
 */

export const resetPassword = asyncHandler(async (req, res) => {
  let token = req.params.resetPasswordToken;
  const { password, confirmPassword } = req.body;

  if (!password || !confirmPassword) {
    throw new CustomError('Please enter all the details', 401);
  }

  if (password !== confirmPassword) {
    throw new CustomError("Confirmed password doesn't match with password", 401);
  }

  token = crypto.createHash('sha256').update(token).digest('hex');

  let user = await User.findOne({
    forgotPasswordToken: token,
    forgotPasswordExpiry: { $gt: new Date() },
  }).select('+password');

  if (!user) {
    throw new CustomError('Token invalid or expired', 401);
  }

  user.password = password;
  user.forgotPasswordToken = undefined;
  user.forgotPasswordExpiry = undefined;
  user = await user.save();

  token = user.generateJWTtoken();
  res.status(201).cookie('token', token, cookieOptions);

  res.status(201).json({
    success: true,
    message: 'Password reset success',
  });
});

/**
 * @PASSWORD_CHANGE
 * @request_type PUT
 * @route http://localhost:4000/api/auth/password/change
 * @description Controller that allows user to change his password
 * @parameters oldPassword, newPassword
 * @returns Response object
 */

export const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new CustomError('Please enter all the details', 401);
  }

  const encryptedPassword = await bcrypt.hash(oldPassword, 10);

  const user = await User.findOne({ password: encryptedPassword }).select('+password');

  if (!user) {
    throw new CustomError('Invalid password', 401);
  }

  user.password = newPassword;
  await user.save();

  res.status(201).json({
    success: true,
    message: 'User has successfully changed his password',
  });
});

/**
 * @GET_PROFILE
 * @request_type GET
 * @route http://localhost:4000/api/auth/getProfile
 * @description Controller that allows user to fetch his profile
 * @parameters none
 * @returns User object
 */

export const getProfile = asyncHandler(async (_req, res) => {
  const { user } = res;

  if (!user) {
    throw new CustomError('User not found', 401);
  }

  res.status(201).json({
    success: true,
    message: 'User profile successfully fetched',
    user,
  });
});

/** Controllers for Category model */

/**
 * @CREATE_CATEGORY
 * @request_type POST
 * @route http://localhost:4000/api/createCategory
 * @description This controller is used to create a category
 * @parameters name
 * @returns category object
 */

export const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (!name) {
    throw new CustomError('Category name is required', 401);
  }

  const category = await Category.create({ name });

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    category,
  });
});

/**
 * @EDIT_CATEGORY
 * @request_type PUT
 * @route http://localhost:4000/api/editCategory/:categoryId
 * @description This controller is used to edit a category
 * @parameters name, categoryId
 * @returns category object
 */

export const editCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { name } = req.body;

  if (!name) {
    throw new CustomError('Category name is required', 401);
  }

  await Category.findByIdAndUpdate(categoryId, { name });
  const category = await Category.findById(categoryId);

  res.status(201).json({
    success: true,
    message: 'Category updated successfully',
    category,
  });
});

/**
 * @DELETE_CATEGORY
 * @request_type DELETE
 * @route http://localhost:4000/api/deleteCategory/:categoryId
 * @description This controller is used to delete a category
 * @parameters categoryId
 * @returns response object
 */

export const deleteCategory = asyncHandler(async (req, res) => {
  await Category.findByIdAndDelete(req.params.categoryId);

  res.status(201).json({
    success: true,
    message: 'Category deleted successfully',
  });
});

/**
 * @GET_CATEGORY
 * @request_type GET
 * @route http://localhost:4000/api/getCategory/:categoryId
 * @description This controller is used to fetch a category
 * @parameters categoryId
 * @returns category object
 */

export const getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.categoryId);

  res.status(201).json({
    success: true,
    message: 'Category fetched successfully',
    category,
  });
});

/**
 * @GET_CATEGORIES
 * @request_type GET
 * @route http://localhost:4000/api/getCategories
 * @description This controller is used to fetch all the categories
 * @parameters none
 * @returns array of category objects
 */

export const getCategories = asyncHandler(async (_req, res) => {
  const categories = await Category.find();

  res.status(201).json({
    success: true,
    message: 'Categories fetched successfully',
    categories,
  });
});
