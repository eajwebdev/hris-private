import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export function useBranches() {
    return useQuery({
        queryKey: ['lookup', 'branches'],
        queryFn: async () => (await api.get('/lookups/branches')).data,
        staleTime: 5 * 60_000,
    });
}

export function useDepartments(branchId) {
    return useQuery({
        queryKey: ['lookup', 'departments', branchId],
        queryFn: async () => (await api.get('/lookups/departments', { params: { branch_id: branchId } })).data,
        enabled: true,
        staleTime: 5 * 60_000,
    });
}

export function usePositions(branchId, departmentId) {
    return useQuery({
        queryKey: ['lookup', 'positions', branchId, departmentId],
        queryFn: async () =>
            (await api.get('/lookups/positions', { params: { branch_id: branchId, department_id: departmentId } })).data,
        staleTime: 5 * 60_000,
    });
}

export function useManagers(branchId) {
    return useQuery({
        queryKey: ['lookup', 'managers', branchId],
        queryFn: async () => (await api.get('/lookups/managers', { params: { branch_id: branchId } })).data,
        staleTime: 60_000,
    });
}

export function useEmployeesLookup(branchId) {
    return useQuery({
        queryKey: ['lookup', 'employees', branchId],
        queryFn: async () => (await api.get('/lookups/employees', { params: { branch_id: branchId } })).data,
        staleTime: 60_000,
    });
}
