import { Controller } from '@nestjs/common';
import { catalog } from '@masterly/proto';
import { CatalogService } from './catalog.service.js';

@Controller()
@catalog.CatalogServiceControllerMethods()
export class CatalogController implements catalog.CatalogServiceController {
  constructor(private readonly catalog: CatalogService) {}

  async getMaster(request: catalog.GetMasterRequest): Promise<catalog.GetMasterResponse> {
    return { master: await this.catalog.getMaster(request) };
  }

  async batchGetMasters(request: catalog.BatchGetMastersRequest): Promise<catalog.BatchGetMastersResponse> {
    return { masters: await this.catalog.batchGet(request.ids) };
  }

  async listServices(request: catalog.ListServicesRequest): Promise<catalog.ListServicesResponse> {
    return { services: await this.catalog.listServices(request.categoryId) };
  }

  async listDeviceModels(request: catalog.ListDeviceModelsRequest): Promise<catalog.ListDeviceModelsResponse> {
    return { models: await this.catalog.listModels(request.brandId, request.query) };
  }

  async updateProfile(request: catalog.UpdateProfileRequest): Promise<catalog.UpdateProfileResponse> {
    return { master: await this.catalog.updateProfile(request) };
  }

  async upsertOffers(request: catalog.UpsertOffersRequest): Promise<catalog.UpsertOffersResponse> {
    return { offers: (await this.catalog.upsertOffers(request.masterId, request.offers)).offers };
  }

  async setSchedule(request: catalog.SetScheduleRequest): Promise<catalog.SetScheduleResponse> {
    return { schedule: (await this.catalog.setSchedule(request)).schedule };
  }

  getMasterContacts(request: catalog.GetMasterContactsRequest): Promise<catalog.GetMasterContactsResponse> {
    return this.catalog.contacts(request.masterId);
  }

  async getPriceStats(request: catalog.GetPriceStatsRequest): Promise<catalog.GetPriceStatsResponse> {
    return { stats: await this.catalog.priceStats(request.cityId) };
  }

  async listCategories(): Promise<catalog.ListCategoriesResponse> {
    return { categories: await this.catalog.categories() };
  }

  async updateCategory(request: catalog.UpdateCategoryRequest): Promise<catalog.UpdateCategoryResponse> {
    return { category: await this.catalog.updateCategory(request.id, request.status) };
  }

  async updateService(request: catalog.UpdateServiceRequest): Promise<catalog.UpdateServiceResponse> {
    return { service: await this.catalog.updateService(request) };
  }

  async addStaff(request: catalog.AddStaffRequest): Promise<catalog.AddStaffResponse> {
    return { master: await this.catalog.addStaff(request) };
  }

  async removeStaff(request: catalog.RemoveStaffRequest): Promise<catalog.RemoveStaffResponse> {
    return { master: await this.catalog.removeStaff(request.masterId, request.staffId) };
  }

  getBilling(request: catalog.GetBillingRequest): Promise<catalog.GetBillingResponse> {
    return this.catalog.billing(request.masterId);
  }

  async requestInvoice(request: catalog.RequestInvoiceRequest): Promise<catalog.RequestInvoiceResponse> {
    return { invoice: await this.catalog.requestInvoice(request) };
  }

  async markInvoicePaid(request: catalog.MarkInvoicePaidRequest): Promise<catalog.MarkInvoicePaidResponse> {
    return { invoice: await this.catalog.markInvoicePaid(request.invoiceId) };
  }

  getPlatformStats(): Promise<catalog.GetPlatformStatsResponse> {
    return this.catalog.platformStats();
  }
}
