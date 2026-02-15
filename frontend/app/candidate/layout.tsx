import CandidateSidebar from "@/components/CandidateSidebar";

export default function CandidateLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-gray-50">
            <CandidateSidebar />
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
