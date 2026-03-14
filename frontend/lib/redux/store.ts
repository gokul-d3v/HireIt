import { configureStore } from '@reduxjs/toolkit';
import questionBankReducer from './slices/questionBankSlice';

export const store = configureStore({
  reducer: {
    questionBank: questionBankReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
