import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Query keys for cache management
export const QUERY_KEYS = {
  accounts: (userId) => ['accounts', userId],
  transactions: (userId) => ['transactions', userId],
  bills: (userId) => ['bills', userId],
  categories: (userId) => ['categories', userId],
  settings: (userId) => ['settings', userId],
};

// Fetch accounts with React Query
export const useAccountsQuery = (userId) => {
  return useQuery({
    queryKey: QUERY_KEYS.accounts(userId),
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await getDocs(collection(db, `users/${userId}/accounts`));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!userId, // Only run query if userId exists
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Fetch transactions with React Query
export const useTransactionsQuery = (userId, options = {}) => {
  const { limitCount = 100, orderByField = 'timestamp', orderDirection = 'desc' } = options;
  
  return useQuery({
    queryKey: QUERY_KEYS.transactions(userId),
    queryFn: async () => {
      if (!userId) return [];
      
      // Import necessary Firestore functions dynamically
      const { query: firestoreQuery, orderBy: firestoreOrderBy, limit: firestoreLimit } = await import('firebase/firestore');
      
      const transactionsRef = collection(db, `users/${userId}/transactions`);
      const q = firestoreQuery(
        transactionsRef,
        firestoreOrderBy(orderByField, orderDirection),
        firestoreLimit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!userId,
    staleTime: 3 * 60 * 1000, // 3 minutes (transactions change more often)
  });
};

// Fetch bills with React Query
export const useBillsQuery = (userId) => {
  return useQuery({
    queryKey: QUERY_KEYS.bills(userId),
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await getDocs(collection(db, `users/${userId}/bills`));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Mutation for updating a document
export const useUpdateDocMutation = (collectionPath, queryKey) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ docId, data }) => {
      const docRef = doc(db, collectionPath, docId);
      await updateDoc(docRef, data);
      return { docId, data };
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey });
    },
  });
};

// Mutation for adding a document
export const useAddDocMutation = (collectionPath, queryKey) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data) => {
      const collectionRef = collection(db, collectionPath);
      const docRef = await addDoc(collectionRef, data);
      return { id: docRef.id, ...data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
};

// Mutation for deleting a document
export const useDeleteDocMutation = (collectionPath, queryKey) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (docId) => {
      const docRef = doc(db, collectionPath, docId);
      await deleteDoc(docRef);
      return docId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
};
