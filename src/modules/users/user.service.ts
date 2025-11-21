import User, { IUser } from './user.model';

export const getUserById = async (id: string): Promise<IUser | null> => {
  return User.findById(id);
};
