import InterviewerSidebar from "@/components/InterviewerSidebar";

export default function InterviewerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-gray-50">
            <InterviewerSidebar />
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
