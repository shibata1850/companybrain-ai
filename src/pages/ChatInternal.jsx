import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ChatInterface from "@/components/chat/ChatInterface";

const CLIENT_ID = "demo-company-001";

export default function ChatInternal() {
  const { data: companyData = [] } = useQuery({
    queryKey: ["companyProfile"],
    queryFn: () => base44.entities.CompanyProfile.filter({ clientCompanyId: CLIENT_ID }),
  });
  const { data: knowledgeData = [] } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => base44.entities.Knowledge.filter({ clientCompanyId: CLIENT_ID }),
  });
  const { data: philosophyData = [] } = useQuery({
    queryKey: ["philosophy"],
    queryFn: () => base44.entities.Philosophy.filter({ clientCompanyId: CLIENT_ID }),
  });

  return (
    <ChatInterface
      mode="internal"
      companyData={companyData}
      knowledgeData={knowledgeData}
      philosophyData={philosophyData}
    />
  );
}