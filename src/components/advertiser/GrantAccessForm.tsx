import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { InputGroup, InputField } from "../../components/ui/input-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  wrapAESKey,
  getPublicKeyForAddress,
  getSaleEncryptionKey,
} from "../../lib/crypto";
import { grantAccessSchema, getFieldErrors } from "../../lib/validation";
import { resolveRecipient } from "../../lib/stellar";
import { FederatedAddressInput } from "../shared/FederatedAddressInput";
import { Eye, Shield, UserCheck } from "lucide-react";

export const GrantAccessForm = () => {
  const [saleId, setSaleId] = useState("");
  const [auditorAddress, setAuditorAddress] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { getCampaignContract } = useWeb3();
  const { showNotification } = useNotification();

  const clearError = (field: string) =>
    setErrors((prev) => ({ ...prev, [field]: "" }));

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = grantAccessSchema.safeParse({
      campaignAddress,
      saleId,
      auditorAddress,
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error));
      return;
    }

    const { data } = result;
    setIsLoading(true);
    try {
      // Always re-resolve the submitted value so a stale or unresolved
      // federation string can never reach the contract call.
      const resolution = await resolveRecipient(data.auditorAddress);
      const recipientAddress =
        resolution.status === "raw" || resolution.status === "federated"
          ? resolution.address
          : undefined;

      if (!recipientAddress) {
        const message =
          resolution.error ||
          "Could not resolve the auditor address to a Stellar public key.";
        setErrors({ auditorAddress: message });
        showNotification({
          type: "error",
          title: "Auditor Not Verified",
          message,
        });
        return;
      }

      const campaignContract = getCampaignContract(data.campaignAddress);

      showNotification({
        type: "info",
        title: "Preparing Access",
        message: "Setting up auditor permissions...",
      });

      const auditorPublicKey = await getPublicKeyForAddress(recipientAddress);
      const encryptionKey = await getSaleEncryptionKey(data.saleId);
      const auditorWrappedKey = await wrapAESKey(
        encryptionKey,
        auditorPublicKey,
      );

      showNotification({
        type: "info",
        title: "Transaction Submitted",
        message: "Granting audit access...",
      });
