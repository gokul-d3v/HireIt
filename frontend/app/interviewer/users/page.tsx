"use client";

import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/api";
import { Users, Shield, ShieldOff, Activity, Clock, ShieldAlert, CheckCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    last_seen?: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCount, setActiveCount] = useState(0);

    const fetchData = async () => {
        try {
            const [usersData, countData] = await Promise.all([
                apiRequest("/api/admin/users", "GET"),
                apiRequest("/api/users/active-count", "GET")
            ]);
            setUsers(usersData || []);
            setActiveCount(countData.active_users);
        } catch (error) {
            // Error handling is already in apiRequest toast
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="p-8">Loading users...</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-100 shadow-sm shadow-indigo-100/50">
                        <Users className="text-indigo-600" size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                            Registered Users
                        </h1>
                        <p className="text-slate-500 font-medium mt-1">Manage access and monitor active sessions</p>
                    </div>
                </div>
                
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-6 py-4 flex items-center gap-4">
                    <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-200">
                        <Activity className="text-white" size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-indigo-600 leading-none">{activeCount}</div>
                        <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-1">Active Users</div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50">
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">User Details</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Role</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Last Active</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-6 py-4 align-top">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-900">{user.name}</span>
                                        <span className="text-sm text-slate-500">{user.email}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600">
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 align-top">
                                    <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                                        <Clock size={14} />
                                        {user.last_seen ? new Date(user.last_seen).toLocaleString() : "Never"}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
