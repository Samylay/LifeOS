/*
 * PROPOSAL ONLY: fixed synthetic package directory commit, never generic paths.
 * Compile only in the reviewed bounded Android NDK image after source review.
 * Actual alias/SELinux/filesystem/binary capability admission is still pending.
 */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/fs.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/xattr.h>
#include <unistd.h>

#define LIMIT (8u * 1024u * 1024u)
/* Leave disabled until the exact owned-image alias readback is reviewed. */
#define REVIEWED_USER0_DATA_ALIAS 0
static const char *names[] = {
    "factory-fixture.db", "factory-fixture.db-wal", "factory-fixture.db-shm"
};
static const char *package_name = "app.micro.factory.fixture";
static const char *owner_attribute = "user.micro.fixture_restore_owner";

static void fail(const char *stage) {
    fprintf(stderr, "fixture-helper failure stage=%s errno=%d\n", stage, errno);
    exit(1);
}
static void check(int condition, const char *stage) {
    if (!condition) { if (!errno) errno = EINVAL; fail(stage); }
}
static int directory(int parent, const char *name) {
    int fd = openat(parent, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) fail("open-fixed-directory");
    return fd;
}
static unsigned number(const char *text) {
    check(text && *text && strspn(text, "0123456789") == strlen(text), "numeric-argument");
    errno = 0; char *end; unsigned long value = strtoul(text, &end, 10);
    check(!errno && !*end && value <= LIMIT, "numeric-bound");
    return (unsigned)value;
}
static int package_root(void) {
    int root = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    check(root >= 0, "open-root");
    int data = directory(root, "data"); close(root);
    int user = directory(data, "user");
    int zero = openat(user, "0", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (zero < 0 && REVIEWED_USER0_DATA_ALIAS) {
        char alias[64]; ssize_t count = readlinkat(user, "0", alias, sizeof(alias));
        check(count == 10 && !memcmp(alias, "/data/data", 10), "exact-reviewed-user0-alias");
        zero = directory(data, "data");
    }
    check(zero >= 0, "unreviewed-user0-path");
    int app = directory(zero, package_name);
    close(zero); close(user); close(data); return app;
}
static void app_label(int app, char label[256]) {
    ssize_t bytes = fgetxattr(app, "security.selinux", label, 255);
    check(bytes > 0 && bytes < 255, "observed-package-label");
    label[bytes] = 0;
    check((size_t)bytes == strlen(label) || (size_t)bytes == strlen(label)+1,
          "package-label-no-embedded-tail");
    static const char prefix[] = "u:object_r:app_data_file:s0";
    check(!strncmp(label, prefix, sizeof(prefix)-1), "package-label-type");
    const char *p = label + sizeof(prefix)-1;
    if (*p) {
        check(*p++ == ':', "package-label-categories");
        do {
            check(*p++ == 'c', "package-label-category");
            check(*p >= '0' && *p <= '9', "package-label-category-number");
            while (*p >= '0' && *p <= '9') ++p;
            if (!*p) break;
            check(*p++ == ',', "package-label-category-separator");
        } while (*p);
        check(p[-1] != ',', "package-label-category-tail");
    }
}
static void identity(int fd, const struct stat *package, const char *label, int is_directory) {
    struct stat st;
    check(!fstat(fd, &st), "fstat-owned");
    check(st.st_uid == package->st_uid && st.st_gid == package->st_gid, "package-owner-readback");
    check((is_directory ? S_ISDIR(st.st_mode) : S_ISREG(st.st_mode)) &&
          !(st.st_mode & (S_ISUID | S_ISGID | S_ISVTX | S_IWOTH)), "owned-type-mode");
    if (!is_directory) check(st.st_nlink == 1 && st.st_size > 0 &&
                            st.st_size <= LIMIT, "regular-single-link-size");
    char actual[256]; ssize_t bytes = fgetxattr(fd, "security.selinux", actual, 255);
    check(bytes > 0 && bytes < 255, "owned-label-readback"); actual[bytes] = 0;
    check((size_t)bytes == strlen(actual) || (size_t)bytes == strlen(actual)+1,
          "owned-label-no-embedded-tail");
    check(!strcmp(actual, label), "package-categories-readback");
}
static void set_identity(int fd, const struct stat *package, const char *label, mode_t mode) {
    check(!fchown(fd, package->st_uid, package->st_gid), "set-target-owner");
    check(!fchmod(fd, mode), "set-target-mode");
    check(!fsetxattr(fd, "security.selinux", label, strlen(label) + 1, 0), "set-target-label");
}
static void absent_sqlite(int parent) {
    struct stat st;
    errno = 0;
    check(fstatat(parent, "SQLite", &st, AT_SYMLINK_NOFOLLOW) < 0 && errno == ENOENT,
          "target-sqlite-absent");
}
static int stage_fd(int parent, const char *stage, const char *owner) {
    int fd = directory(parent, stage);
    char actual[33];
    ssize_t count = fgetxattr(fd, owner_attribute, actual, sizeof(actual));
    check(count == 32 && !memcmp(actual, owner, 32), "exact-stage-owner");
    return fd;
}
static void same_stage(int parent, const char *name, int fd) {
    struct stat held, named;
    check(!fstat(fd, &held) && !fstatat(parent, name, &named, AT_SYMLINK_NOFOLLOW)
          && S_ISDIR(named.st_mode) && held.st_dev == named.st_dev
          && held.st_ino == named.st_ino, "stage-name-inode-binding");
}
static void quiescent(unsigned uid) {
    DIR *proc = opendir("/proc"); check(proc != NULL, "open-process-inventory");
    struct dirent *entry;
    while ((errno = 0, entry = readdir(proc))) {
        if (!*entry->d_name || strspn(entry->d_name, "0123456789") != strlen(entry->d_name)) continue;
        int pid = openat(dirfd(proc), entry->d_name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
        if (pid < 0 && errno == ENOENT) continue;
        check(pid >= 0, "process-directory");
        int status = openat(pid, "status", O_RDONLY | O_NOFOLLOW | O_CLOEXEC); close(pid);
        if (status < 0 && errno == ENOENT) continue;
        check(status >= 0, "process-status");
        char buffer[16385]; ssize_t size = read(status, buffer, sizeof(buffer)-1); close(status);
        check(size >= 0 && size < (ssize_t)sizeof(buffer)-1, "bounded-process-status"); buffer[size] = 0;
        char *row = strstr(buffer, "\nUid:");
        check(row != NULL, "process-uid-field");
        unsigned real, effective, saved, fs;
        check(sscanf(row, "\nUid: %u %u %u %u", &real, &effective, &saved, &fs) == 4, "process-uid-values");
        check(real != uid && effective != uid && saved != uid && fs != uid, "fixture-process-active");
    }
    check(!errno, "complete-process-inventory"); closedir(proc);
}
static void verify_files(int stage, const struct stat *app, const char *label,
                         const unsigned expected[3], int adjust) {
    DIR *listing = fdopendir(dup(stage)); check(listing != NULL, "stage-list");
    unsigned total = 0, seen = 0; struct dirent *entry;
    while ((errno = 0, entry = readdir(listing))) {
        if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
        int index = -1;
        for (int i = 0; i < 3; ++i) if (!strcmp(entry->d_name, names[i])) index = i;
        check(index >= 0 && expected[index] && !(seen & (1u << index)), "complete-known-stage-files");
        int fd = openat(stage, names[index], O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
        check(fd >= 0, "open-staged-file");
        struct stat before, after; check(!fstat(fd, &before), "staged-file-stat");
        check(S_ISREG(before.st_mode) && before.st_nlink == 1 &&
              before.st_size == expected[index], "expected-stage-size");
        if (adjust) set_identity(fd, app, label, 0600);
        identity(fd, app, label, 0); check(!fsync(fd), "staged-file-fsync");
        check(!fstat(fd, &after) && after.st_dev == before.st_dev &&
              after.st_ino == before.st_ino && after.st_size == before.st_size,
              "staged-file-identity-fence");
        close(fd); total += expected[index]; check(total <= LIMIT, "complete-stage-size");
        seen |= 1u << index;
    }
    check(!errno, "complete-stage-list"); closedir(listing);
    check((seen & 1u) && (seen & 2u) == (expected[1] ? 2u : 0u) &&
          (seen & 4u) == (expected[2] ? 4u : 0u), "complete-stage-manifest");
}
static void cleanup_files(int stage, const unsigned expected[3]) {
    /* An interrupted transfer may have only a bounded subset of known files. */
    DIR *listing = fdopendir(dup(stage)); check(listing != NULL, "cleanup-stage-list");
    unsigned seen = 0; struct dirent *entry;
    while ((errno = 0, entry = readdir(listing))) {
        if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
        int index = -1;
        for (int i = 0; i < 3; ++i) if (!strcmp(entry->d_name, names[i])) index = i;
        check(index >= 0 && expected[index] && !(seen & (1u << index)), "cleanup-known-subset");
        struct stat st;
        check(!fstatat(stage, names[index], &st, AT_SYMLINK_NOFOLLOW)
              && S_ISREG(st.st_mode) && st.st_nlink == 1 && st.st_size >= 0
              && st.st_size <= expected[index], "cleanup-regular-bounded-file");
        seen |= 1u << index;
    }
    check(!errno, "complete-cleanup-stage-list"); closedir(listing);
    for (int i = 0; i < 3; ++i)
        if (seen & (1u << i)) check(!unlinkat(stage, names[i], 0), "remove-owned-stage-file");
}
int main(int argc, char **argv) {
    alarm(20); /* Bound this exact helper even if its ADB transport disappears. */
    /* No paths supplied: op, controller32hex owner, observed UID, three sizes. */
    check(argc == 7 && geteuid() == 0, "fixed-argument-count-root");
    const char *op = argv[1], *owner = argv[2];
    check(strlen(owner) == 32 && strspn(owner, "0123456789abcdef") == 32, "generated-owner");
    unsigned uid = number(argv[3]), sizes[3];
    check(uid >= 10000 && uid < 100000, "observed-app-uid");
    for (int i = 0; i < 3; ++i) sizes[i] = number(argv[i+4]);
    check(sizes[0] && (unsigned long)sizes[0] + sizes[1] + sizes[2] <= LIMIT, "manifest-total");
    check(!strcmp(op, "prepare") || !strcmp(op, "seal") || !strcmp(op, "commit") || !strcmp(op, "cleanup") ||
          !strcmp(op, "metadata"), "fixed-operation");
    char stage[96]; snprintf(stage, sizeof(stage), ".micro-fixture-restore-%s", owner);
    int app = package_root(); struct stat observed;
    check(!fstat(app, &observed) && observed.st_uid == uid, "actual-package-uid");
    char label[256]; app_label(app, label); quiescent(uid);
    int parent = directory(app, "files"); identity(parent, &observed, label, 1);
    if (!strcmp(op, "metadata")) {
        absent_sqlite(parent);
        printf("{\"status\":\"empty-target\",\"uid\":%u,\"gid\":%u,\"parentDevice\":%llu,\"label\":\"%s\"}\n",
               observed.st_uid, observed.st_gid, (unsigned long long)observed.st_dev, label);
        close(parent); close(app); return 0;
    }
    if (!strcmp(op, "prepare")) {
        absent_sqlite(parent);
        check(!mkdirat(parent, stage, 0700), "exclusive-stage-create");
        int fd = directory(parent, stage);
        check(!fsetxattr(fd, owner_attribute, owner, 32, XATTR_CREATE), "exclusive-stage-owner");
        set_identity(fd, &observed, label, 0700);
        identity(fd, &observed, label, 1); check(!fsync(fd), "prepared-stage-fsync");
        close(fd); check(!fsync(parent), "prepared-parent-fsync");
    } else {
        if (!strcmp(op, "cleanup")) {
            struct stat missing; errno = 0;
            if (fstatat(parent, stage, &missing, AT_SYMLINK_NOFOLLOW) < 0) {
                check(errno == ENOENT, "cleanup-specific-stage-absence");
                printf("{\"status\":\"cleanup-completed\",\"owner\":\"%s\",\"uid\":%u,\"gid\":%u,\"stageAbsent\":true}\n",
                       owner, observed.st_uid, observed.st_gid);
                close(parent); close(app); return 0;
            }
        }
        int fd = stage_fd(parent, stage, owner); same_stage(parent, stage, fd);
        if (!strcmp(op, "commit") || !strcmp(op, "seal")) {
            identity(fd, &observed, label, 1);
            absent_sqlite(parent);
            verify_files(fd, &observed, label, sizes, !strcmp(op, "seal"));
            /* Keep the owner marker across rename failure and successful commit.
             * Cleanup never targets SQLite, even if a post-rename fsync fails. */
            check(!fsync(fd), "staged-directory-fsync"); quiescent(uid);
            struct stat st; check(!fstat(fd, &st) && st.st_dev == observed.st_dev, "same-filesystem-stage");
            same_stage(parent, stage, fd);
            /* No fallback to rename/mv, no replacement of an existing target. */
            if (!strcmp(op, "commit")) {
                check(!syscall(SYS_renameat2, parent, stage, parent, "SQLite", RENAME_NOREPLACE), "atomic-noreplace-commit");
                check(!fsync(parent), "committed-parent-fsync");
            }
        } else {
            /* Cleanup only a marker-bound stage, never the committed SQLite. */
            cleanup_files(fd, sizes);
            check(!fsync(fd), "cleanup-stage-fsync");
            same_stage(parent, stage, fd);
            check(!unlinkat(parent, stage, AT_REMOVEDIR), "remove-owned-stage-directory");
            check(!fsync(parent), "cleanup-parent-fsync");
            struct stat missing; errno = 0;
            check(fstatat(parent, stage, &missing, AT_SYMLINK_NOFOLLOW) < 0 && errno == ENOENT,
                  "cleanup-confirmed-stage-absence");
        }
        close(fd);
    }
    if (!strcmp(op, "cleanup"))
        printf("{\"status\":\"cleanup-completed\",\"owner\":\"%s\",\"uid\":%u,\"gid\":%u,\"stageAbsent\":true}\n",
               owner, observed.st_uid, observed.st_gid);
    else
        printf("{\"status\":\"%s-completed\",\"owner\":\"%s\",\"uid\":%u,\"gid\":%u}\n",
               op, owner, observed.st_uid, observed.st_gid);
    close(parent); close(app); return 0;
}
