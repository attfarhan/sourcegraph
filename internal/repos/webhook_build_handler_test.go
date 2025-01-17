package repos

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/sourcegraph/log/logtest"

	"github.com/sourcegraph/sourcegraph/internal/api"
	"github.com/sourcegraph/sourcegraph/internal/database"
	"github.com/sourcegraph/sourcegraph/internal/database/dbtest"
	"github.com/sourcegraph/sourcegraph/internal/extsvc"
	"github.com/sourcegraph/sourcegraph/internal/extsvc/github"
	"github.com/sourcegraph/sourcegraph/internal/httpcli"
	"github.com/sourcegraph/sourcegraph/internal/httptestutil"
	"github.com/sourcegraph/sourcegraph/internal/repos/webhookworker"
	"github.com/sourcegraph/sourcegraph/internal/types"
	"github.com/sourcegraph/sourcegraph/schema"
)

func TestWebhookBuildHandle(t *testing.T) {
	logger := logtest.Scoped(t)
	ctx := context.Background()

	token := os.Getenv("GITHUB_TOKEN")

	db := database.NewDB(logger, dbtest.NewDB(logger, t))
	store := NewStore(logger, db)
	esStore := store.ExternalServiceStore()
	repoStore := store.RepoStore()

	repo := &types.Repo{
		ID:       1,
		Name:     api.RepoName("ghe.sgdev.org/milton/test"),
		Metadata: &github.Repository{},
		ExternalRepo: api.ExternalRepoSpec{
			ID:          "12345",
			ServiceID:   "https://ghe.sgdev.org",
			ServiceType: extsvc.TypeGitHub,
		},
	}
	if err := repoStore.Create(ctx, repo); err != nil {
		t.Fatal(err)
	}

	ghConn := &schema.GitHubConnection{
		Url:      extsvc.KindGitHub,
		Token:    token,
		Repos:    []string{string(repo.Name)},
		Webhooks: []*schema.GitHubWebhook{{Org: "ghe.sgdev.org", Secret: "secret"}},
	}

	configData, err := json.Marshal(ghConn)
	if err != nil {
		t.Fatal(err)
	}

	config := string(configData)
	svc := &types.ExternalService{
		Kind:        extsvc.KindGitHub,
		DisplayName: "TestService",
		Config:      extsvc.NewUnencryptedConfig(config),
	}
	if err := esStore.Upsert(ctx, svc); err != nil {
		t.Fatal(err)
	}

	job := &webhookworker.Job{
		RepoID:     int32(repo.ID),
		RepoName:   string(repo.Name),
		Org:        strings.Split(string(repo.Name), "/")[0],
		ExtSvcID:   svc.ID,
		ExtSvcKind: svc.Kind,
	}

	testName := "webhook-build-handler"
	cf, save := httptestutil.NewGitHubRecorderFactory(t, update(testName), testName)
	defer save()

	opts := []httpcli.Opt{}
	doer, err := cf.Doer(opts...)
	if err != nil {
		t.Fatal(err)
	}

	handler := newWebhookBuildHandler(store, doer)
	if err := handler.Handle(ctx, logger, job); err != nil {
		t.Fatal(err)
	}
}
